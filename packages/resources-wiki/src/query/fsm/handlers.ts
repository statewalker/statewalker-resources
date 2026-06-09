import type { Project } from "@statewalker/resources-workspace";
import type { DocumentMeta } from "../../knowledge/types.js";
import type { LlmApi, WikiLlmConfiguration } from "../../llm/index.js";
import { SearchAdapter } from "../../search/index.js";
import { toCanonical } from "../../uri/wiki-uri.js";
import type { EvidenceSection } from "../progress.js";
import {
  getAnswer,
  getConfig,
  getEvidence,
  getIntent,
  getLlm,
  getProgress,
  getProject,
  getRequest,
  getSummaries,
  setAnswer,
  setEvidence,
  setIntent,
  setSummaries,
} from "./context.js";
import {
  COMPOSE_PROMPT,
  DOC_TOPIC_SELECT_PROMPT,
  INTENT_DETECTION_PROMPT,
  SUMMARIZE_PROMPT,
  TOPIC_SELECT_PROMPT,
} from "./prompts.js";
import type { QueryHandler } from "./query-fsm.js";
import {
  aggregateClasses,
  buildDocTopicCandidates,
  evidenceFor,
  filterCitations,
  hybridSearch,
  orderEvidence,
  readClassIndexes,
  renderFoldSection,
  sectionId,
} from "./retrieval.js";
import {
  composeInputSchema,
  composeSchema,
  docTopicSelectInputSchema,
  docTopicSelectSchema,
  intentDetectionInputSchema,
  intentDetectionSchema,
  summarizeInputSchema,
  summarizeSchema,
  topicSelectInputSchema,
  topicSelectSchema,
} from "./schemas.js";

const toClass = (c: { key: string; name: string; description?: string }) => ({
  key: c.key,
  name: c.name,
  description: c.description,
});

/**
 * Classify on/off-corpus and decompose the prompt into distinct search subjects.
 * The vault's class vocabulary is supplied so subjects use the corpus's wording.
 * Sets `wiki:intent`; yields `onCorpus` | `offCorpus`.
 */
export const IntentDetectionTrigger: QueryHandler = async function* (ctx) {
  const project = getProject(ctx);
  const llm = getLlm(ctx);
  const cfg = getConfig(ctx);
  const req = getRequest(ctx);
  const { topics, outliers } = await readClassIndexes(project);

  const { output } = await llm.generateObject({
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
  });

  // Recall-first fallback: an on-corpus prompt with no subjects becomes the whole question.
  const subjects =
    output.onCorpus && output.subjects.length === 0 ? [{ prompt: req.question }] : output.subjects;
  setIntent(ctx, {
    onCorpus: output.onCorpus,
    subjects: output.onCorpus ? subjects : [],
    offCorpusReason: output.offCorpusReason,
  });
  yield output.onCorpus ? "onCorpus" : "offCorpus";
};

/**
 * The LLM topic/doc-topic class ladder for one subject: select global classes, resolve
 * them to per-document topic candidates, pre-filter recall-first, descend to sections.
 */
async function classLadder(
  project: Project,
  llm: LlmApi,
  cfg: WikiLlmConfiguration,
  subjectPrompt: string,
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<{ uri: string; sectionKey: string }[]> {
  const { topics, outliers } = await readClassIndexes(project);
  if (topics.size === 0 && outliers.size === 0) return [];

  const { output: sel } = await llm.generateObject({
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
  });

  const selTopics = sel.topicKeys.map((k) => topics.get(k)).filter((t) => t !== undefined);
  const selOutliers = sel.outlierKeys.map((k) => outliers.get(k)).filter((o) => o !== undefined);
  const candidates = [
    ...(await buildDocTopicCandidates(project, selTopics, (m) => m.topics, metaCache)),
    ...(await buildDocTopicCandidates(project, selOutliers, (m) => m.outliers, metaCache)),
  ];
  if (candidates.length === 0) return [];

  const { output: filtered } = await llm.generateObject({
    name: "doc-topic-select",
    description:
      "Pre-filter the document-topics; remove only the clearly non-relevant ones (recall-first).",
    model: cfg.modelFor("query"),
    system: DOC_TOPIC_SELECT_PROMPT,
    input: {
      subject: subjectPrompt,
      candidates: candidates.map((c) => ({
        uri: c.uri,
        name: c.name,
        description: c.description,
        brief: c.brief,
      })),
    },
    inputSchema: docTopicSelectInputSchema,
    outputSchema: docTopicSelectSchema,
  });

  const kept = new Set(filtered.selected);
  const survivors = candidates.filter((c) => kept.has(c.uri));
  // Recall-first: never drop everything — if the filter kept nothing, keep all.
  const docTopics = survivors.length > 0 ? survivors : candidates;
  return docTopics.flatMap((c) => c.sectionKeys.map((sk) => ({ uri: c.baseUri, sectionKey: sk })));
}

/**
 * Per subject (handler-internal fan-out, parallel), run hybrid search and the class
 * ladder; merge their candidate sections into one evidence pool deduped by
 * `(uri, sectionKey)`. Sets `wiki:evidence`; yields `gathered` | `empty`.
 */
export const RetrieveTrigger: QueryHandler = async function* (ctx) {
  const project = getProject(ctx);
  const llm = getLlm(ctx);
  const cfg = getConfig(ctx);
  const progress = getProgress(ctx);
  const { subjects } = getIntent(ctx);
  const search = project.getAdapter(SearchAdapter);
  const metaCache = new Map<string, DocumentMeta | undefined>();

  // Gather candidate (uri, sectionKey) pairs across every subject and front-end.
  const perSubject = await Promise.all(
    subjects.map(async (subject) => {
      const [searchHits, ladderHits] = await Promise.all([
        search ? hybridSearch(search, subject.prompt) : Promise.resolve([]),
        classLadder(project, llm, cfg, subject.prompt, metaCache),
      ]);
      return [...searchHits, ...ladderHits];
    }),
  );

  // Dedup by (uri, sectionKey), then resolve evidence once per unique section.
  const seen = new Set<string>();
  const unique: { uri: string; sectionKey: string }[] = [];
  for (const pair of perSubject.flat()) {
    const id = sectionId(pair.uri, pair.sectionKey);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(pair);
  }
  const evidence = (
    await Promise.all(unique.map((p) => evidenceFor(project, p.uri, p.sectionKey)))
  ).filter((e): e is EvidenceSection => e !== undefined);

  setEvidence(ctx, evidence);
  progress.evidence = evidence;
  yield evidence.length > 0 ? "gathered" : "empty";
};

/** Deduplicate + document-order the evidence pool. Yields `planned`. */
export const ChapterPlanTrigger: QueryHandler = async function* (ctx) {
  const project = getProject(ctx);
  const ordered = await orderEvidence(project, getEvidence(ctx));
  setEvidence(ctx, ordered);
  getProgress(ctx).evidence = ordered;
  yield "planned";
};

/**
 * Window-bounded rolling summarization: fold each chapter into the running summary
 * via a prompt that exposes the previous summary + the section's title, description,
 * and raw content as separate XML tags. Sets `wiki:summaries`; yields `summarized`.
 */
export const SummarizeTrigger: QueryHandler = async function* (ctx) {
  const project = getProject(ctx);
  const llm = getLlm(ctx);
  const cfg = getConfig(ctx);
  const req = getRequest(ctx);
  const evidence = getEvidence(ctx);
  const key = project.projectName;

  const refs: string[] = [];
  let previousSummary = "";
  for (const ev of evidence) {
    const canonical = toCanonical({ key, path: ev.uri, section: ev.sectionKey }, key);
    refs.push(canonical);
    const section = renderFoldSection({
      previousSummary,
      marker: `[[${canonical}]]`,
      title: ev.title,
      description: ev.summary,
      raw: ev.rawBlock,
    });
    const { output } = await llm.generateObject({
      name: "summarize-fold",
      description: "Fold one section's raw content into the rolling summary; keep every marker.",
      model: cfg.modelFor("query"),
      system: SUMMARIZE_PROMPT,
      input: { question: req.question, section },
      inputSchema: summarizeInputSchema,
      outputSchema: summarizeSchema,
    });
    previousSummary = output.text;
  }

  setSummaries(ctx, [{ text: previousSummary, refs }]);
  yield "summarized";
};

/**
 * Compose the grounded, cited answer from the rolling summaries (no raw re-fetch),
 * and aggregate the evidence's topic/outlier classes. Sets `wiki:answer`; yields
 * `answered`. Citations are filtered mechanically at `Verify`.
 */
export const RespondTrigger: QueryHandler = async function* (ctx) {
  const project = getProject(ctx);
  const llm = getLlm(ctx);
  const cfg = getConfig(ctx);
  const req = getRequest(ctx);
  const summaries = getSummaries(ctx);
  const evidence = getEvidence(ctx);

  const { output: composed } = await llm.generateObject({
    name: "compose-answer",
    description:
      "Compose the grounded answer from the rolling summaries; keep every [[...]] marker.",
    model: cfg.modelFor("query"),
    system: COMPOSE_PROMPT,
    input: { question: req.question, summaries: summaries.map((s) => ({ text: s.text })) },
    inputSchema: composeInputSchema,
    outputSchema: composeSchema,
  });

  const { topics, outliers } = await aggregateClasses(project, evidence);
  setAnswer(ctx, {
    text: composed.text,
    citations: composed.citations,
    caveats: [],
    suggestions: composed.suggestions,
    topics,
    outliers,
    evidenceCount: evidence.length,
  });
  yield "answered";
};

/** Mechanical citation filter: drop citations not resolving to retrieved evidence. Yields `verified`. */
export const VerifyTrigger: QueryHandler = async function* (ctx) {
  const answer = getAnswer(ctx);
  const evidence = getEvidence(ctx);
  const { citations, caveats } = filterCitations(evidence, answer.citations);
  setAnswer(ctx, { ...answer, citations, caveats: [...answer.caveats, ...caveats] });
  yield "verified";
};

/** Terminal success: publish the composed answer onto `QueryProgress`. Yields `done`. */
export const ResponseTrigger: QueryHandler = async function* (ctx) {
  getProgress(ctx)._finish(getAnswer(ctx));
  yield "done";
};

/**
 * Terminal graceful failure: publish a no-evidence (on-corpus) or off-corpus
 * answer. Reached from `IntentDetection` (offCorpus) or `Retrieve` (empty).
 * Yields `done`.
 */
export const NegativeResponseTrigger: QueryHandler = async function* (ctx) {
  const intent = getIntent(ctx);
  const text = intent.onCorpus
    ? "No supporting evidence found."
    : intent.offCorpusReason
      ? `This question is outside the wiki's scope: ${intent.offCorpusReason}`
      : "This question is outside the wiki's scope.";
  getProgress(ctx)._finish({
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
