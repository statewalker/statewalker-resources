import { loggerOf, type Project } from "@statewalker/resources-workspace";
import { WikiPageSummary } from "../../knowledge/page-adapters.js";
import type { DocumentMeta } from "../../knowledge/types.js";
import {
  costOf,
  type GenerateObjectSpec,
  type LlmApi,
  type LlmCallUsage,
  llmOf,
  roundUsd,
  sumCosts,
  type WikiLlmConfiguration,
  wikiConfigOf,
} from "../../llm/index.js";
import { SearchAdapter } from "../../search/index.js";
import { toCanonical } from "../../uri/wiki-uri.js";
import { mapLimit } from "../../util/batch.js";
import type { EvidenceSection, QueryProgress } from "../progress.js";
import {
  COMPOSE_PROMPT,
  INTENT_DETECTION_PROMPT,
  SECTION_SELECT_PROMPT,
  SUMMARIZE_PROMPT,
  TOPIC_SELECT_PROMPT,
} from "./prompts.js";
import type { Candidate, QueryContext, SubjectGroup } from "./query-context.js";
import type { QueryHandler } from "./query-fsm.js";
import {
  aggregateClasses,
  buildDocTopicCandidates,
  evidenceFor,
  type FilterSection,
  filterCitations,
  hybridSearch,
  orderEvidence,
  packFilterBatches,
  readClassIndexes,
  renderFoldSection,
  sectionId,
} from "./retrieval.js";
import {
  composeInputSchema,
  composeSchema,
  intentDetectionInputSchema,
  intentDetectionSchema,
  sectionFilterInputSchema,
  sectionFilterSchema,
  summarizeInputSchema,
  summarizeSchema,
  topicSelectInputSchema,
  topicSelectSchema,
} from "./schemas.js";

/** Char budget per relevance-filter batch (token-window proxy at ~4 chars/token). */
const FILTER_CHAR_BUDGET = 16_000;

/** Summarization batching: sections per batch, char ceiling per batch, and max parallel calls. */
const SUMMARIZE_BATCH_SIZE = 4;
const SUMMARIZE_CHAR_BUDGET = 24_000;
const SUMMARIZE_CONCURRENCY = 5;

/** Pack sections into batches bounded by both a section count and a raw-content char ceiling. */
function batchSections(
  sections: EvidenceSection[],
  maxCount: number,
  maxChars: number,
): EvidenceSection[][] {
  const batches: EvidenceSection[][] = [];
  let cur: EvidenceSection[] = [];
  let chars = 0;
  for (const ev of sections) {
    const cost = ev.rawBlock.length + ev.summary.length + ev.title.length + 64;
    if (cur.length > 0 && (cur.length >= maxCount || chars + cost > maxChars)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(ev);
    chars += cost;
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}

/**
 * Escalation ladder by retrieval score: tier 0 = sections found by BOTH front-ends
 * (the high-confidence intersection), tier 1 = the single-front-end remainder.
 * SelectSections consumes one tier per pass; Respond escalates only when the
 * evidence gathered so far does not yet answer the prompt.
 */
const TIER_SCORES = [2, 1] as const;

/** The ladder tier a section of `score` belongs to (unknown scores fall in the last tier). */
function tierOfScore(score: number): number {
  const i = TIER_SCORES.indexOf(score as (typeof TIER_SCORES)[number]);
  return i === -1 ? TIER_SCORES.length - 1 : i;
}

type QueryLog = ReturnType<typeof loggerOf>;

/** Run one structured-generation call: record it on `progress`, log model/latency/tokens/cost. */
async function timedGenerate<I, O>(
  llm: LlmApi,
  log: QueryLog,
  progress: QueryProgress,
  spec: GenerateObjectSpec<I, O>,
  extra?: Record<string, unknown>,
): Promise<{ output: O; usage: LlmCallUsage }> {
  const startedAt = Date.now();
  const res = await llm.generateObject(spec);
  const ms = Date.now() - startedAt;
  const cost = costOf(spec.model, res.usage);
  progress.recordLlmCall({
    name: spec.name,
    model: spec.model,
    ms,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
  });
  log.info("llm call", {
    name: spec.name,
    model: spec.model,
    ms,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
    inputUsd: roundUsd(cost.inputUsd),
    outputUsd: roundUsd(cost.outputUsd),
    totalUsd: roundUsd(cost.totalUsd),
    ...extra,
  });
  return res;
}

/** Log a per-batch rollup: call count, wall-clock, summed token usage, and summed USD cost. */
function logBatchTotals(
  log: QueryLog,
  name: string,
  model: string,
  startedAt: number,
  usages: LlmCallUsage[],
): void {
  const cost = sumCosts(usages.map((u) => costOf(model, u)));
  log.info("llm batch totals", {
    name,
    model,
    calls: usages.length,
    ms: Date.now() - startedAt,
    inputTokens: usages.reduce((s, u) => s + u.inputTokens, 0),
    outputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
    inputUsd: roundUsd(cost.inputUsd),
    outputUsd: roundUsd(cost.outputUsd),
    totalUsd: roundUsd(cost.totalUsd),
  });
}

/** Render answer claims to prose: each statement followed by its `[[ref]]` citations. Partial-safe
 * (fields may be missing mid-stream); skips empty entries. */
function renderClaims(
  claims: ReadonlyArray<{ statement?: string; citations?: readonly string[] } | undefined>,
): string {
  return claims
    .filter((c) => c != null)
    .map((c) => {
      const cites = (c?.citations ?? []).map((r) => `[[${r}]]`).join("; ");
      const statement = c?.statement ?? "";
      return cites ? `${statement} ${cites}` : statement;
    })
    .join("\n");
}

const toClass = (c: { key: string; name: string; description?: string }) => ({
  key: c.key,
  name: c.name,
  description: c.description,
});

/**
 * Classify on/off-corpus and decompose the prompt into distinct search subjects.
 * The vault's class vocabulary is supplied so subjects use the corpus's wording.
 * Sets `ctx.intent`; yields `onCorpus` | `offCorpus`.
 */
export const IntentDetectionTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");
  const { topics, outliers } = await readClassIndexes(project);

  const { output } = await timedGenerate(llm, log, progress, {
    name: "intent-detection",
    description:
      "Classify on/off-corpus and decompose the prompt into search subjects. Does NOT answer it.",
    model: cfg.modelFor("query"),
    system: INTENT_DETECTION_PROMPT,
    input: {
      question: req.question,
      availableTopics: [...topics.values()].map(toClass),
      availableOutliers: [...outliers.values()].map(toClass),
    },
    inputSchema: intentDetectionInputSchema,
    outputSchema: intentDetectionSchema,
    strict: true,
  });

  // Recall-first fallback: an on-corpus prompt with no subjects becomes the whole question.
  const subjects =
    output.onCorpus && output.subjects.length === 0 ? [{ prompt: req.question }] : output.subjects;
  ctx.setIntent({
    onCorpus: output.onCorpus,
    subjects: output.onCorpus ? subjects : [],
    offCorpusReason: output.offCorpusReason ?? undefined,
  });
  yield output.onCorpus ? "onCorpus" : "offCorpus";
};

/**
 * The LLM topic class ladder for one subject: select relevant global classes,
 * resolve them to per-document topic candidates, and descend to every section
 * those topics span. Precision is deferred to the section-relevance filter in
 * `SelectSections` — this front-end is recall-only.
 */
async function classLadder(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  progress: QueryProgress,
  subjectPrompt: string,
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<{ uri: string; sectionKey: string }[]> {
  const { topics, outliers } = await readClassIndexes(project);
  if (topics.size === 0 && outliers.size === 0) return [];

  const { output: sel } = await timedGenerate(llm, loggerOf(project, "QueryFsm"), progress, {
    name: "topic-select",
    description: "Exhaustively select relevant topic + outlier class keys for the subject.",
    model: cfg.modelFor("query"),
    system: TOPIC_SELECT_PROMPT,
    input: {
      subject: subjectPrompt,
      availableTopics: [...topics.values()].map(toClass),
      availableOutliers: [...outliers.values()].map(toClass),
    },
    inputSchema: topicSelectInputSchema,
    outputSchema: topicSelectSchema,
    strict: true,
  });

  const selTopics = sel.topicKeys.map((k) => topics.get(k)).filter((t) => t !== undefined);
  const selOutliers = sel.outlierKeys.map((k) => outliers.get(k)).filter((o) => o !== undefined);
  const candidates = [
    ...(await buildDocTopicCandidates(project, selTopics, (m) => m.topics, metaCache)),
    ...(await buildDocTopicCandidates(project, selOutliers, (m) => m.outliers, metaCache)),
  ];
  return candidates.flatMap((c) => c.sectionKeys.map((sk) => ({ uri: c.baseUri, sectionKey: sk })));
}

/**
 * Per subject (handler-internal fan-out, parallel), run hybrid search and the class
 * ladder; merge their candidate sections into one evidence pool deduped by
 * `(uri, sectionKey)`. Sets `ctx.candidates`; yields `gathered` | `empty`.
 */
export const RetrieveTrigger: QueryHandler = async function* (ctx) {
  const { project, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const { subjects } = ctx.intent;
  const search = project.getAdapter(SearchAdapter);
  const metaCache = new Map<string, DocumentMeta | undefined>();

  // Per unique section, track which front-ends surfaced it (→ score) and which
  // subjects it served (→ summary grouping). Both front-ends ⇒ a stronger signal.
  const signal = new Map<
    string,
    { uri: string; sectionKey: string; fronts: Set<string>; subjects: Set<number> }
  >();
  const record = (hits: { uri: string; sectionKey: string }[], front: string, subject: number) => {
    for (const h of hits) {
      const id = sectionId(h.uri, h.sectionKey);
      const e = signal.get(id) ?? {
        uri: h.uri,
        sectionKey: h.sectionKey,
        fronts: new Set<string>(),
        subjects: new Set<number>(),
      };
      e.fronts.add(front);
      e.subjects.add(subject);
      signal.set(id, e);
    }
  };
  await Promise.all(
    subjects.map(async (subject, i) => {
      const [searchHits, ladderHits] = await Promise.all([
        search ? hybridSearch(search, subject.prompt) : Promise.resolve([]),
        classLadder(project, llm, cfg, progress, subject.prompt, metaCache),
      ]);
      record(searchHits, "search", i);
      record(ladderHits, "ladder", i);
    }),
  );

  // Resolve evidence once per unique section; attach score + subject membership.
  const entries = [...signal.values()];
  const resolved = await Promise.all(entries.map((e) => evidenceFor(project, e.uri, e.sectionKey)));
  const candidates: Candidate[] = [];
  entries.forEach((e, i) => {
    const section = resolved[i];
    if (section) candidates.push({ section, score: e.fronts.size, subjects: [...e.subjects] });
  });

  ctx.setCandidates(candidates);
  // The escalation accumulators (tier/evidence/summaries) start from their QueryContext
  // defaults; Retrieve runs once before the SelectSections → Respond loop, so no reset.
  progress.evidence = candidates.map((c) => c.section);
  const perDoc = new Map<string, number>();
  for (const c of candidates) perDoc.set(c.section.uri, (perDoc.get(c.section.uri) ?? 0) + 1);
  loggerOf(project, "QueryFsm").info("retrieved evidence", {
    subjects: subjects.length,
    sections: candidates.length,
    documents: perDoc.size,
    sectionsPerDoc: [...perDoc.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([uri, n]) => `${n}× ${uri}`),
  });
  yield candidates.length > 0 ? "gathered" : "empty";
};

/**
 * The relevance filter over a candidate set: order by score (both-front-end first),
 * pack document-grouped into token-bounded batches, and run one lightweight-model
 * filter call per batch IN PARALLEL. Returns the surviving candidates (those whose
 * URI a batch echoed back).
 */
async function filterByRelevance(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  progress: QueryProgress,
  question: string,
  candidates: Candidate[],
): Promise<Candidate[]> {
  if (candidates.length === 0) return [];
  const byId = new Map(candidates.map((c) => [sectionId(c.section.uri, c.section.sectionKey), c]));

  // Document titles for the doc-grouped filter input (one read per document).
  const docTitle = new Map<string, string>();
  for (const uri of new Set(candidates.map((c) => c.section.uri))) {
    const summary = await (await project.getProjectResource(uri))
      ?.getAdapter(WikiPageSummary)
      ?.get();
    docTitle.set(uri, summary?.title ?? uri);
  }

  // High-signal documents (best section score) first; keep each document contiguous.
  const docMax = new Map<string, number>();
  for (const c of candidates) {
    docMax.set(c.section.uri, Math.max(docMax.get(c.section.uri) ?? 0, c.score));
  }
  const ordered = [...candidates].sort(
    (a, b) =>
      (docMax.get(b.section.uri) ?? 0) - (docMax.get(a.section.uri) ?? 0) ||
      a.section.uri.localeCompare(b.section.uri) ||
      b.score - a.score,
  );
  const filterSections: FilterSection[] = ordered.map((c) => ({
    uri: sectionId(c.section.uri, c.section.sectionKey),
    docUri: c.section.uri,
    docTitle: docTitle.get(c.section.uri) ?? c.section.uri,
    title: c.section.title,
    summary: c.section.summary,
  }));
  const batches = packFilterBatches(filterSections, FILTER_CHAR_BUDGET);

  const log = loggerOf(project, "QueryFsm");
  const model = cfg.modelFor("queryFast");
  const startedAt = Date.now();
  const results = await Promise.all(
    batches.map((documents, i) =>
      timedGenerate(
        llm,
        log,
        progress,
        {
          name: "section-select",
          description:
            "Keep only the candidate sections in this batch that could answer the prompt.",
          model,
          system: SECTION_SELECT_PROMPT,
          input: {
            question,
            documents: documents.map((d) => ({ title: d.title, sections: d.sections })),
          },
          inputSchema: sectionFilterInputSchema,
          outputSchema: sectionFilterSchema,
          strict: true,
        },
        { batch: i + 1, of: batches.length },
      ),
    ),
  );
  logBatchTotals(
    log,
    "section-select",
    model,
    startedAt,
    results.map((r) => r.usage),
  );
  const selected = new Set(
    results.flatMap((r) => r.output.relevantUris).filter((uri) => byId.has(uri)),
  );
  return candidates.filter((c) => selected.has(sectionId(c.section.uri, c.section.sectionKey)));
}

/**
 * Consume the next escalation tier (score 2 first, then score 1), relevance-filter
 * its candidates, group the survivors by subject, and APPEND them to the running
 * evidence union — `ctx.groups` carries only THIS tier's delta for Summarize to
 * fold. Skips empty tiers. Yields `selected` (a tier was consumed) or `empty` (no
 * candidate anywhere). Re-entered from Respond when more evidence is needed.
 */
export const SelectSectionsTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const { subjects } = ctx.intent;
  const candidates = ctx.candidates;

  // Advance to the next tier that actually has candidates (no LLM call for empty tiers).
  let tierCands: Candidate[] = [];
  while (ctx.tier < TIER_SCORES.length) {
    const cands = candidates.filter((c) => c.score === TIER_SCORES[ctx.tier]);
    ctx.advanceTier();
    if (cands.length > 0) {
      tierCands = cands;
      break;
    }
  }
  const tier = ctx.tier;

  if (tierCands.length === 0) {
    // No further candidates. Keep prior evidence (if any) for a best-effort answer.
    ctx.setGroups([]);
    const total = ctx.evidence.length;
    loggerOf(project, "QueryFsm").info("selected sections", { tier, added: 0, total });
    yield total > 0 ? "selected" : "empty";
    return;
  }

  const survivors = await filterByRelevance(project, llm, cfg, progress, req.question, tierCands);

  // Group THIS tier's survivors by the subject(s) that retrieved them (the delta).
  const bySubject = new Map<number, EvidenceSection[]>();
  for (const c of survivors) {
    for (const s of c.subjects) {
      const list = bySubject.get(s) ?? [];
      list.push(c.section);
      bySubject.set(s, list);
    }
  }
  const groups: SubjectGroup[] = [];
  for (const [i, sections] of [...bySubject.entries()].sort((a, b) => a[0] - b[0])) {
    const prompt = subjects[i]?.prompt;
    if (!prompt || sections.length === 0) continue;
    groups.push({ prompt, sections: await orderEvidence(project, sections) });
  }
  ctx.setGroups(groups);

  // Accumulate the selected union across tiers (drives topics + citation verify);
  // addEvidence re-orders the union and keeps progress.evidence in sync.
  await ctx.addEvidence(survivors.map((c) => c.section));
  loggerOf(project, "QueryFsm").info("selected sections", {
    tier,
    tierCandidates: tierCands.length,
    added: survivors.length,
    total: ctx.evidence.length,
    subjects: groups.length,
  });
  yield "selected";
};

/**
 * Batch summarization: split THIS tier's selected sections into batches (bounded by
 * section count and raw-content size), summarize each batch into one dense, fact-only
 * summary in a SEPARATE call, and run the batches in parallel (≤ SUMMARIZE_CONCURRENCY
 * at once). Appends the fresh summaries to the prior tiers' via `ctx.addSummaries`;
 * yields `summarized`.
 */
export const SummarizeTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const key = project.projectName;
  const log = loggerOf(project, "QueryFsm");

  // Flatten this tier's per-subject groups into the unique new sections to summarize.
  const seen = new Set<string>();
  const sections: EvidenceSection[] = [];
  for (const group of ctx.groups) {
    for (const ev of group.sections) {
      const id = sectionId(ev.uri, ev.sectionKey);
      if (seen.has(id)) continue;
      seen.add(id);
      sections.push(ev);
    }
  }

  const batches = batchSections(sections, SUMMARIZE_BATCH_SIZE, SUMMARIZE_CHAR_BUDGET);
  log.info("summarize batches", { sections: sections.length, batches: batches.length });
  const startedAt = Date.now();
  const results = await mapLimit(batches, SUMMARIZE_CONCURRENCY, async (batch, b) => {
    const refs: string[] = [];
    const rendered = batch
      .map((ev) => {
        const canonical = toCanonical({ key, path: ev.uri, section: ev.sectionKey }, key);
        refs.push(canonical);
        return renderFoldSection({
          marker: `[[${canonical}]]`,
          title: ev.title,
          description: ev.summary,
          raw: ev.rawBlock,
        });
      })
      .join("\n\n");
    const { output, usage } = await timedGenerate(
      llm,
      log,
      progress,
      {
        name: "summarize-batch",
        description:
          "Summarize a batch of sections into one dense, question-relevant summary; keep every marker.",
        model: cfg.modelFor("query"),
        system: SUMMARIZE_PROMPT,
        input: { question: req.question, sections: rendered },
        inputSchema: summarizeInputSchema,
        outputSchema: summarizeSchema,
        strict: true,
      },
      { batch: b + 1, of: batches.length, sections: batch.length },
    );
    return { summary: { text: output.text, refs }, usage };
  });
  logBatchTotals(
    log,
    "summarize-batch",
    cfg.modelFor("query"),
    startedAt,
    results.map((r) => r.usage),
  );

  ctx.addSummaries(results.map((r) => r.summary));
  yield "summarized";
};

/** Whether any candidate sits in a not-yet-consumed tier (an escalation can still add evidence). */
function tierRemaining(ctx: QueryContext): boolean {
  return ctx.candidates.some((c) => tierOfScore(c.score) >= ctx.tier);
}

/**
 * Compose the grounded, cited answer from the rolling summaries and judge whether the
 * gathered evidence actually answers the prompt. Sufficient → `answered`. Insufficient
 * with a lower retrieval tier still available → `insufficient` (escalate: re-enter
 * SelectSections). Insufficient with nothing left → accept the best-effort answer and
 * attach a caveat naming what's missing. Citations are filtered mechanically at `Verify`.
 */
export const RespondTrigger: QueryHandler = async function* (ctx) {
  const { project, request: req, progress } = ctx;
  const llm = llmOf(project);
  const cfg = wikiConfigOf(project);
  const log = loggerOf(project, "QueryFsm");
  const summaries = ctx.summaries;
  const evidence = ctx.evidence;

  const { output: composed } = await timedGenerate(llm, log, progress, {
    name: "compose-answer",
    description:
      "Answer the prompt as individually-cited claims from the rolling summaries, and report whether the evidence sufficed.",
    // The final answer uses the ADVANCED model; sections were pre-selected by the weak `queryFast`.
    model: cfg.modelFor("queryStrong"),
    system: COMPOSE_PROMPT,
    input: {
      question: req.question,
      summaries: summaries.map((s) => ({ text: s.text, refs: s.refs })),
    },
    inputSchema: composeInputSchema,
    outputSchema: composeSchema,
    strict: true,
    // Stream COMPLETED claims only (drop the in-progress last one) so each renders whole with its
    // citations — char-by-char citation streaming would garble the [[…]] wrappers. Reset on escalate.
    onPartial: (partial) => {
      const claims = (partial as { claims?: Parameters<typeof renderClaims>[0] }).claims ?? [];
      progress.setPartialText(renderClaims(claims.slice(0, -1)));
    },
  });

  // Escalate before finalising: more evidence may still be gathered.
  if (!composed.sufficient && tierRemaining(ctx)) {
    log.info("escalating", { missing: composed.missing });
    progress.setPartialText("");
    yield "insufficient";
    return;
  }

  // Keep only grounded claims (each carries ≥1 citation); render them to the answer text.
  const grounded = composed.claims.filter((c) => c.citations.length > 0);
  const dropped = composed.claims.length - grounded.length;
  const caveats: string[] = [];
  if (dropped > 0) caveats.push(`${dropped} ungrounded claim(s) omitted.`);
  if (!composed.sufficient && composed.missing) {
    caveats.push(`Information may be incomplete: ${composed.missing}`);
  }
  // Flush the full grounded render (the streamed preview omitted the final claim).
  const text = renderClaims(grounded);
  progress.setPartialText(text);
  const { topics, outliers } = await aggregateClasses(project, evidence);
  ctx.setAnswer({
    text,
    citations: [...new Set(grounded.flatMap((c) => c.citations))],
    caveats,
    suggestions: composed.suggestions,
    topics,
    outliers,
    evidenceCount: evidence.length,
  });
  yield "answered";
};

/** Mechanical citation filter: drop citations not resolving to retrieved evidence. Yields `verified`. */
export const VerifyTrigger: QueryHandler = async function* (ctx) {
  const answer = ctx.answer;
  const evidence = ctx.evidence;
  const { citations, caveats } = filterCitations(evidence, answer.citations);
  ctx.setAnswer({ ...answer, citations, caveats: [...answer.caveats, ...caveats] });
  yield "verified";
};

/** Terminal success: publish the composed answer onto `QueryProgress`. Yields `done`. */
export const ResponseTrigger: QueryHandler = async function* (ctx) {
  ctx.progress._finish(ctx.answer);
  yield "done";
};

/**
 * Terminal graceful failure: publish a no-evidence (on-corpus) or off-corpus
 * answer. Reached from `IntentDetection` (offCorpus) or `Retrieve` (empty).
 * Yields `done`.
 */
export const NegativeResponseTrigger: QueryHandler = async function* (ctx) {
  const intent = ctx.intent;
  const text = intent.onCorpus
    ? "No supporting evidence found."
    : intent.offCorpusReason
      ? `This question is outside the wiki's scope: ${intent.offCorpusReason}`
      : "This question is outside the wiki's scope.";
  ctx.progress._finish({
    text,
    citations: [],
    caveats: [],
    suggestions: [],
    topics: [],
    outliers: [],
    evidenceCount: 0,
  });
  yield "done";
};
