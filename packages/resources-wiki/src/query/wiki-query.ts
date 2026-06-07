import {
  type Adaptable,
  Project,
  ResourceAdapter,
  type ResourceRepository,
} from "@statewalker/resources-workspace";
import { z } from "zod";
import { WikiTopicIndex } from "../knowledge/indexes.js";
import { ResourceTextContentCache, WikiPageSummary } from "../knowledge/page-adapters.js";
import { type LlmCaller, type LlmModels, resolveModel } from "../llm/index.js";
import { SearchAdapter } from "../search/index.js";
import { parseWikiUri } from "../uri/wiki-uri.js";

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

export interface Answer {
  text: string;
  citations: string[];
  caveats: string[];
  suggestions: string[];
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

  stage(name: string): void {
    this.stages.push({ name, status: "running" });
  }
  _finish(answer: Answer): void {
    this.answer = answer;
    if (this.stages.length) this.stages[this.stages.length - 1].status = "done";
    for (const r of this.resolvers) r(answer);
  }
  _fail(error: unknown): void {
    this.error = error;
    if (this.stages.length) this.stages[this.stages.length - 1].status = "failed";
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
    progress.stage("reformulate");
    const { output: routes } = await this.opts.llm.generate({
      name: "reformulate-query",
      model: resolveModel(this.opts.models, "query"),
      system: REFORMULATE_PROMPT,
      input: { question },
      inputSchema: reformulationInputSchema,
      outputSchema: reformulationSchema,
    });

    const hasAny =
      (routes.textQueries?.length ?? 0) +
        (routes.semanticQueries?.length ?? 0) +
        (routes.topicDescent?.length ?? 0) >
      0;

    progress.stage("retrieve");
    const hits = new Map<string, EvidenceSection>();
    const add = async (uri: string, sectionKey: string) => {
      const id = `${uri}#${sectionKey}`;
      if (hits.has(id)) return;
      const ev = await this.evidenceFor(uri, sectionKey);
      if (ev) hits.set(id, ev);
    };

    // Search branch (FTS for text queries, vector for semantic; default = both on the question).
    const textQueries = routes.textQueries ?? (hasAny ? [] : [question]);
    const semanticQueries = routes.semanticQueries ?? (hasAny ? [] : [question]);
    const search = this.project.getAdapter(SearchAdapter);
    if (search) {
      for (const q of textQueries) {
        for (const m of await search.search({ query: q, modes: ["fts"] })) {
          for (const s of m.sections) await add(m.uri, s.sectionKey);
        }
      }
      for (const q of semanticQueries) {
        for (const m of await search.search({ query: q, modes: ["vector"] })) {
          for (const s of m.sections) await add(m.uri, s.sectionKey);
        }
      }
    }

    // Topic-descent branch: match topics, descend to their referenced documents' sections.
    const topicTerms = routes.topicDescent ?? (hasAny ? [] : [question]);
    if (topicTerms.length > 0) {
      const index = this.project.requireAdapter(WikiTopicIndex);
      for await (const topic of index.list()) {
        const match = topicTerms.some(
          (t) =>
            topic.key === t ||
            topic.name.toLowerCase().includes(t.toLowerCase()) ||
            t.toLowerCase().includes(topic.key),
        );
        if (!match) continue;
        for (const ref of topic.references) {
          const resource = await this.project.getProjectResource(ref.uri);
          const summary = await resource?.requireAdapter(WikiPageSummary).get();
          for (const section of summary?.sections ?? []) await add(ref.uri, section.key);
        }
      }
    }

    progress.evidence = [...hits.values()];

    if (progress.evidence.length === 0) {
      progress.stage("respond");
      progress._finish({
        text: "No supporting evidence found.",
        citations: [],
        caveats: [],
        suggestions: [],
        evidenceCount: 0,
      });
      return;
    }

    progress.stage("respond");
    const { output: composed } = await this.opts.llm.generate({
      name: "compose-answer",
      model: resolveModel(this.opts.models, "query"),
      system: COMPOSE_PROMPT,
      input: { question, evidence: progress.evidence },
      inputSchema: composeInputSchema,
      outputSchema: composeSchema,
    });

    // Verify: keep only citations that resolve to a retrieved (uri, sectionKey).
    progress.stage("verify");
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

    progress._finish({
      text: composed.text,
      citations,
      caveats,
      suggestions: composed.suggestions,
      evidenceCount: progress.evidence.length,
    });
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
