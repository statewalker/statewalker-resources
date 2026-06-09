import {
  type Adaptable,
  loggerOf,
  Project,
  ResourceAdapter,
  type ResourceRepository,
} from "@statewalker/resources-workspace";
import { z } from "zod";
import { WikiOutlierIndex, WikiTopicIndex } from "../knowledge/indexes.js";
import {
  ResourceTextContentCache,
  WikiPageMeta,
  WikiPageSummary,
} from "../knowledge/page-adapters.js";
import type { DocumentMeta, GlobalOutlier, GlobalTopic } from "../knowledge/types.js";
import { type LlmCaller, type LlmModels, resolveModel } from "../llm/index.js";
import { SearchAdapter } from "../search/index.js";
import { parseWikiUri, toCanonical } from "../uri/wiki-uri.js";

/** How far retrieval may descend. */
export type QueryDepth = "summaries" | "source-sections";

/** A retrieved section: its summary plus the corresponding original text block. */
export interface EvidenceSection {
  uri: string;
  sectionKey: string;
  summary: string;
  rawBlock: string;
}

/** Output of the reformulation step — each field is optional; absent = branch off. */
export interface ReformulationOutput {
  textQueries?: string[];
  semanticQueries?: string[];
  topicDescent?: string[];
}

/** A topic/outlier class the answer's evidence touched, with its covering citations. */
export interface AnswerTopic {
  key: string;
  name: string;
  description?: string;
  citations: { uri: string }[];
}

export interface Answer {
  text: string;
  citations: string[];
  caveats: string[];
  suggestions: string[];
  /** Topic classes covered by the retrieved evidence, cited to their sections. */
  topics: AnswerTopic[];
  /** Outlier classes covered by the retrieved evidence, cited to their sections. */
  outliers: AnswerTopic[];
  /** Number of evidence sections the answer was grounded in (0 = negative answer). */
  evidenceCount: number;
}

const reformulationSchema = z
  .object({
    textQueries: z.array(z.string()).optional(),
    semanticQueries: z.array(z.string()).optional(),
    topicDescent: z.array(z.string()).optional(),
  })
  .describe("Optional retrieval directives. Omit a field to skip that branch.");

const reformulationInputSchema = z.object({ question: z.string() });

const availableClassSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

const topicSelectSchema = z
  .object({
    topicKeys: z
      .array(z.string())
      .describe(
        "Topic-class key slugs (from availableTopics) plausibly worth searching for this subject. Be exhaustive — prefer over-inclusion. MUST be drawn from the supplied keys.",
      ),
    outlierKeys: z
      .array(z.string())
      .describe(
        "Outlier-class key slugs (from availableOutliers) plausibly relevant to this subject. MUST be drawn from the supplied keys.",
      ),
  })
  .describe(
    "Selected topic + outlier class keys for one subject, drawn only from the supplied lists.",
  );

const topicSelectInputSchema = z.object({
  subject: z.string().describe("The question being routed."),
  availableTopics: z.array(availableClassSchema),
  availableOutliers: z.array(availableClassSchema),
});

const composeSchema = z.object({
  text: z.string(),
  citations: z.array(z.string()),
  suggestions: z.array(z.string()),
});
const composeInputSchema = z.object({
  question: z.string(),
  evidence: z.array(
    z.object({
      uri: z.string(),
      sectionKey: z.string(),
      summary: z.string(),
      rawBlock: z.string(),
    }),
  ),
});

const REFORMULATE_PROMPT = `You route a question to retrieval branches. Emit optional
textQueries (keyword/FTS), semanticQueries (semantic/vector), and topicDescent (topic
class names/keys). Use textQueries/semanticQueries for questions naming explicit
entities or notions; topicDescent for thematic questions. When unsure, emit both a
semantic query and a topic descent.`;

const TOPIC_SELECT_PROMPT = `You select the topic and outlier classes worth searching for
a subject. You receive the subject and the corpus's topic + outlier classes, each as
key/name/description with no documents attached. Return the KEY SLUGS — drawn verbatim from
the supplied lists — of every class plausibly relevant to the subject. Be EXHAUSTIVE:
over-inclusion is corrected by later grounding, but a class omitted here can never
contribute. Populate outlierKeys for questions about anomalies, exceptions, disagreements,
or surprises, and include plainly-relevant outliers otherwise. When nothing plausibly
matches, return empty arrays. Selection only — do not answer the subject.`;

const COMPOSE_PROMPT = `Answer the question grounded ONLY in the supplied evidence
sections. Every claim MUST carry a [[wiki://<key>/<uri>#<sectionKey>]] citation to the
evidence it rests on. Do not invent citations. If the evidence does not support an
answer, say so plainly.`;

/** Observable query run: filled asynchronously; await `complete()` for the Answer. */
export class QueryProgress {
  stages: { name: string; status: "running" | "done" | "failed" }[] = [];
  evidence: EvidenceSection[] = [];
  answer?: Answer;
  error?: unknown;
  private resolvers: ((a: Answer) => void)[] = [];
  private rejecters: ((e: unknown) => void)[] = [];
  private listeners: (() => void)[] = [];

  /** Subscribe to progress changes (each stage transition and terminal state). Returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }

  stage(name: string): void {
    this.stages.push({ name, status: "running" });
    this.emit();
  }
  _finish(answer: Answer): void {
    this.answer = answer;
    if (this.stages.length) this.stages[this.stages.length - 1].status = "done";
    this.emit();
    for (const r of this.resolvers) r(answer);
  }
  _fail(error: unknown): void {
    this.error = error;
    if (this.stages.length) this.stages[this.stages.length - 1].status = "failed";
    this.emit();
    for (const r of this.rejecters) r(error);
  }
  complete(): Promise<Answer> {
    if (this.answer) return Promise.resolve(this.answer);
    if (this.error) return Promise.reject(this.error);
    return new Promise<Answer>((resolve, reject) => {
      this.resolvers.push(resolve);
      this.rejecters.push(reject);
    });
  }
}

interface QueryOptions {
  depthFloor?: QueryDepth;
  depthCeiling?: QueryDepth;
}

interface AdapterOptions extends Record<string, unknown> {
  models: LlmModels;
  llm: LlmCaller;
  corpusPurpose?: string;
}

/**
 * Routed question answering on a project's wiki. `ask` returns a `QueryProgress`
 * synchronously and fills it asynchronously: an LLM reformulation step routes the
 * question to the search (FTS/vector) and/or topic-descent branches, their section
 * evidence is merged and deduped by `(uri, sectionKey)`, and a grounded, cited answer
 * is composed. A question with no supporting evidence yields a terminal negative answer.
 */
export class WikiQuery extends ResourceAdapter {
  private get opts(): AdapterOptions {
    return this.options as AdapterOptions;
  }
  private get project(): Project {
    return this.resource.requireAdapter<Project>(Project);
  }

  ask(question: string, opts: QueryOptions = {}): QueryProgress {
    const progress = new QueryProgress();
    this.run(question, opts, progress).catch((err) => progress._fail(err));
    return progress;
  }

  private async run(question: string, _opts: QueryOptions, progress: QueryProgress): Promise<void> {
    const log = loggerOf(this.project, "WikiQuery");
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    // Open a stage: record it on `progress`, log its start, and return a `done`
    // fn logging the stage's elapsed time plus any measured metrics (counts, tokens).
    const stage = (name: string): ((metrics?: Record<string, unknown>) => void) => {
      progress.stage(name);
      const t0 = Date.now();
      log.info(`stage start: ${name}`, { stage: name });
      return (metrics = {}) =>
        log.info(`stage done: ${name}`, { stage: name, ms: Date.now() - t0, ...metrics });
    };

    log.info("query received", { question });
    const doneReformulate = stage("reformulate");
    const { output: routes, usage: reformUsage } = await this.opts.llm.generate({
      name: "reformulate-query",
      model: resolveModel(this.opts.models, "query"),
      system: REFORMULATE_PROMPT,
      input: { question },
      inputSchema: reformulationInputSchema,
      outputSchema: reformulationSchema,
    });
    inputTokens += reformUsage.inputTokens;
    outputTokens += reformUsage.outputTokens;
    doneReformulate({
      inputTokens: reformUsage.inputTokens,
      outputTokens: reformUsage.outputTokens,
      textQueries: routes.textQueries ?? [],
      semanticQueries: routes.semanticQueries ?? [],
      topicDescent: routes.topicDescent ?? [],
    });

    const hasAny =
      (routes.textQueries?.length ?? 0) +
        (routes.semanticQueries?.length ?? 0) +
        (routes.topicDescent?.length ?? 0) >
      0;

    const doneRetrieve = stage("retrieve");
    const hits = new Map<string, EvidenceSection>();
    const add = async (uri: string, sectionKey: string) => {
      const id = `${uri}#${sectionKey}`;
      if (hits.has(id)) return;
      const ev = await this.evidenceFor(uri, sectionKey);
      if (ev) {
        hits.set(id, ev);
        log.debug("evidence section retrieved", { uri, sectionKey });
      }
    };

    // Search branch (FTS for text queries, vector for semantic; default = both on the question).
    const textQueries = routes.textQueries ?? (hasAny ? [] : [question]);
    const semanticQueries = routes.semanticQueries ?? (hasAny ? [] : [question]);
    const search = this.project.getAdapter(SearchAdapter);
    if (search) {
      for (const q of textQueries) {
        const matches = await search.search({ query: q, modes: ["fts"] });
        log.debug("full-text search", { query: q, documents: matches.length });
        for (const m of matches) {
          for (const s of m.sections) await add(m.uri, s.sectionKey);
        }
      }
      for (const q of semanticQueries) {
        const matches = await search.search({ query: q, modes: ["vector"] });
        log.debug("semantic search", { query: q, documents: matches.length });
        for (const m of matches) {
          for (const s of m.sections) await add(m.uri, s.sectionKey);
        }
      }
    } else {
      log.debug("no search index available — skipping FTS/vector branch");
    }

    // Topic-descent branch: an LLM selects the relevant topic/outlier classes for the
    // subject from the indexes (key/name/description only), then we descend into the
    // selected classes' referenced documents' sections. This replaces mechanical string
    // matching — relevance is judged semantically, exhaustively (over-include).
    const wantTopicDescent = (routes.topicDescent?.length ?? 0) > 0 || !hasAny;
    let topicsExplored = 0;
    let topicsMatched = 0;
    let documentsExplored = 0;
    if (wantTopicDescent) {
      const topics = new Map<string, GlobalTopic>();
      const outliers = new Map<string, GlobalOutlier>();
      for await (const t of this.project.requireAdapter(WikiTopicIndex).list()) {
        topics.set(t.key, t);
      }
      for await (const o of this.project.requireAdapter(WikiOutlierIndex).list()) {
        outliers.set(o.key, o);
      }
      topicsExplored = topics.size + outliers.size;
      if (topicsExplored > 0) {
        const toClass = (c: { key: string; name: string; description?: string }) => ({
          key: c.key,
          name: c.name,
          description: c.description,
        });
        const { output: sel, usage: selUsage } = await this.opts.llm.generate({
          name: "select-topics",
          description:
            "Select the topic + outlier class keys worth searching for the subject, from key/name/description only.",
          model: resolveModel(this.opts.models, "query"),
          system: TOPIC_SELECT_PROMPT,
          input: {
            subject: question,
            availableTopics: [...topics.values()].map(toClass),
            availableOutliers: [...outliers.values()].map(toClass),
          },
          inputSchema: topicSelectInputSchema,
          outputSchema: topicSelectSchema,
        });
        inputTokens += selUsage.inputTokens;
        outputTokens += selUsage.outputTokens;

        const selectedTopics = sel.topicKeys
          .map((k) => topics.get(k))
          .filter((t): t is GlobalTopic => !!t);
        const selectedOutliers = sel.outlierKeys
          .map((k) => outliers.get(k))
          .filter((o): o is GlobalOutlier => !!o);
        topicsMatched = selectedTopics.length + selectedOutliers.length;
        log.debug("topic selection", {
          topics: selectedTopics.map((t) => t.key),
          outliers: selectedOutliers.map((o) => o.key),
        });

        // Descend a selected class into its referenced documents. References are
        // `<uri>#<per-doc-key>`: descend only into the sections that source's own
        // declaration covers, falling back to all sections when unresolvable.
        const descend = async (
          references: { uri: string }[],
          declsOf: (meta: DocumentMeta) => { key: string; sectionKeys: string[] }[],
        ) => {
          for (const ref of references) {
            const { path: docUri, section: perDocKey } = parseWikiUri(ref.uri);
            const resource = await this.project.getProjectResource(docUri);
            if (!resource) continue;
            const meta = await resource.requireAdapter(WikiPageMeta).get();
            const decl =
              perDocKey && meta ? declsOf(meta).find((d) => d.key === perDocKey) : undefined;
            const sectionKeys =
              decl?.sectionKeys ??
              (await resource.requireAdapter(WikiPageSummary).get())?.sections.map((s) => s.key) ??
              [];
            documentsExplored++;
            for (const sectionKey of sectionKeys) await add(docUri, sectionKey);
          }
        };
        for (const t of selectedTopics) await descend(t.references, (m) => m.topics);
        for (const o of selectedOutliers) await descend(o.references, (m) => m.outliers);
      }
    }

    progress.evidence = [...hits.values()];
    doneRetrieve({
      ftsQueries: textQueries.length,
      semanticQueries: semanticQueries.length,
      topicsExplored,
      topicsMatched,
      documentsExplored,
      evidenceSections: progress.evidence.length,
    });

    if (progress.evidence.length === 0) {
      const doneRespond = stage("respond");
      doneRespond({ outcome: "no-evidence" });
      log.info("query complete", {
        ms: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        evidenceCount: 0,
        outcome: "no-evidence",
      });
      progress._finish({
        text: "No supporting evidence found.",
        citations: [],
        caveats: [],
        suggestions: [],
        topics: [],
        outliers: [],
        evidenceCount: 0,
      });
      return;
    }

    const { topics, outliers } = await this.aggregateClasses(progress.evidence);
    log.debug("aggregated classes", { topics: topics.length, outliers: outliers.length });

    const doneRespond = stage("respond");
    const { output: composed, usage: composeUsage } = await this.opts.llm.generate({
      name: "compose-answer",
      model: resolveModel(this.opts.models, "query"),
      system: COMPOSE_PROMPT,
      input: { question, evidence: progress.evidence },
      inputSchema: composeInputSchema,
      outputSchema: composeSchema,
    });
    inputTokens += composeUsage.inputTokens;
    outputTokens += composeUsage.outputTokens;
    doneRespond({
      inputTokens: composeUsage.inputTokens,
      outputTokens: composeUsage.outputTokens,
      evidenceSections: progress.evidence.length,
      claimedCitations: composed.citations.length,
    });

    // Verify: keep only citations that resolve to a retrieved (uri, sectionKey).
    const doneVerify = stage("verify");
    const evidenceIds = new Set(progress.evidence.map((e) => `${e.uri}#${e.sectionKey}`));
    const caveats: string[] = [];
    const citations = composed.citations.filter((c) => {
      try {
        const ref = parseWikiUri(c);
        return ref.section !== undefined && evidenceIds.has(`${ref.path}#${ref.section}`);
      } catch {
        return false;
      }
    });
    if (citations.length < composed.citations.length) {
      caveats.push("Some citations did not resolve to retrieved evidence and were dropped.");
    }
    doneVerify({
      citations: citations.length,
      dropped: composed.citations.length - citations.length,
    });

    log.info("query complete", {
      ms: Date.now() - startedAt,
      inputTokens,
      outputTokens,
      evidenceCount: progress.evidence.length,
      citations: citations.length,
      topics: topics.length,
      outliers: outliers.length,
    });
    progress._finish({
      text: composed.text,
      citations,
      caveats,
      suggestions: composed.suggestions,
      topics,
      outliers,
      evidenceCount: progress.evidence.length,
    });
  }

  /**
   * Aggregate the topic/outlier classes the retrieved evidence touches. For each
   * evidence page we read its `WikiPageMeta` and keep every declared class whose
   * `sectionKeys` intersect the retrieved sections, citing each covered section as
   * a canonical `wiki://` reference. Classes are unioned across pages by key.
   */
  private async aggregateClasses(
    evidence: EvidenceSection[],
  ): Promise<{ topics: AnswerTopic[]; outliers: AnswerTopic[] }> {
    const key = this.project.projectName;
    const sectionsByUri = new Map<string, Set<string>>();
    for (const e of evidence) {
      const set = sectionsByUri.get(e.uri) ?? new Set<string>();
      set.add(e.sectionKey);
      sectionsByUri.set(e.uri, set);
    }

    const topics = new Map<string, AnswerTopic>();
    const outliers = new Map<string, AnswerTopic>();
    const collect = (
      decls: { key: string; name: string; description?: string; sectionKeys: string[] }[],
      uri: string,
      covered: Set<string>,
      target: Map<string, AnswerTopic>,
    ) => {
      for (const d of decls) {
        const hits = d.sectionKeys.filter((sk) => covered.has(sk));
        if (hits.length === 0) continue;
        const agg =
          target.get(d.key) ??
          ({ key: d.key, name: d.name, description: d.description, citations: [] } as AnswerTopic);
        for (const sk of hits) {
          agg.citations.push({ uri: toCanonical({ key, path: uri, section: sk }, key) });
        }
        target.set(d.key, agg);
      }
    };

    for (const [uri, covered] of sectionsByUri) {
      const resource = await this.project.getProjectResource(uri);
      const meta = await resource?.requireAdapter(WikiPageMeta).get();
      if (!meta) continue;
      collect(meta.topics, uri, covered, topics);
      collect(meta.outliers, uri, covered, outliers);
    }
    return { topics: [...topics.values()], outliers: [...outliers.values()] };
  }

  /** Build an evidence section from a page's summary + raw text block. */
  private async evidenceFor(uri: string, sectionKey: string): Promise<EvidenceSection | undefined> {
    const resource = await this.project.getProjectResource(uri);
    if (!resource) return undefined;
    const summary = await resource.requireAdapter(WikiPageSummary).get();
    const section = summary?.sections.find((s) => s.key === sectionKey);
    if (!section) return undefined;
    const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
    const lines = raw.split("\n");
    const rawBlock = lines.slice(section.startLine, section.endLine + 1).join("\n");
    return { uri, sectionKey, summary: section.summary, rawBlock };
  }
}

/** Register `WikiQuery` (project-level) with its models / caller. */
export function registerQuery(
  repository: ResourceRepository,
  deps: { models: LlmModels; llm: LlmCaller; corpusPurpose?: string },
): () => void {
  return repository.register("", WikiQuery, (adaptable: Adaptable) => {
    const options: AdapterOptions = {
      models: deps.models,
      llm: deps.llm,
      corpusPurpose: deps.corpusPurpose,
    };
    return new WikiQuery(adaptable, options);
  });
}
