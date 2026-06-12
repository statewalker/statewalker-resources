import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ProjectBuilder,
  type Resource,
  ResourceRepository,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type EmbedFn,
  type LlmApi,
  metaBuilder,
  registerContentExtraction,
  registerKnowledgeAdapters,
  registerQuery,
  registerSearch,
  reorganizeBuilder,
  type SearchBlock,
  searchBuilder,
  summarizeBuilder,
  WikiPageSummary,
  WikiQuery,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("acme")) v[0] = 1;
  if (text.toLowerCase().includes("found")) v[1] = 1;
  return v;
};

const SUMMARY: DocumentSummaryOutput = {
  title: "Acme",
  summary: "Acme and its founders.",
  sections: [
    { key: "intro", title: "Intro", startLine: 0, endLine: 0, summary: "Acme is a company." },
    { key: "founders", title: "Founders", startLine: 1, endLine: 1, summary: "Jane founded Acme." },
  ],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "company-founders",
      name: "Company founders",
      description: "People who found companies.",
      sectionKeys: ["founders"],
      brief: "Jane founded Acme.",
    },
  ],
  outliers: [],
};

const MARKER_RE = /\[\[(\/[^\]]+)\]\]/g;

// Per-test controls + observations.
interface Intent {
  onCorpus: boolean;
  subjects: { prompt: string }[];
  offCorpusReason?: string;
}
let intent: Intent;
let selectedTopicKeys: ((available: string[]) => string[]) | undefined;
let calls: Record<string, number>;
let foldSections: string[];
/** Compose reports "sufficient" only after this many compose calls (0 = always sufficient). */
let sufficientAfter: number;

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  calls[spec.name] = (calls[spec.name] ?? 0) + 1;
  switch (spec.name) {
    case "summarize-document":
      return out(SUMMARY);
    case "extract-document-meta":
      return out(META);
    case "intent-detection":
      return out(intent);
    case "topic-select": {
      const input = spec.input as {
        availableTopics: { key: string }[];
        availableOutliers: { key: string }[];
      };
      const topicKeys = input.availableTopics.map((t) => t.key);
      const outlierKeys = input.availableOutliers.map((o) => o.key);
      return out({
        topicKeys: selectedTopicKeys ? selectedTopicKeys(topicKeys) : topicKeys,
        outlierKeys,
      });
    }
    case "section-select": {
      // Keep every candidate section in the batch.
      const docs = (spec.input as { documents: { sections: { uri: string }[] }[] }).documents;
      return out({ relevantUris: docs.flatMap((d) => d.sections.map((s) => s.uri)) });
    }
    case "summarize-batch": {
      const sections = (spec.input as { sections: string }).sections;
      foldSections.push(sections);
      // Keep every marker in the batch so citations propagate to compose.
      const markers = [...sections.matchAll(MARKER_RE)].map((m) => m[0]).join(" ");
      return out({ text: `facts ${markers}`.trim() });
    }
    case "compose-answer": {
      const text = (spec.input as { summaries: { text: string }[] }).summaries
        .map((s) => s.text)
        .join(" ");
      // One grounded claim per marker found in the summaries' text.
      const claims = [...text.matchAll(MARKER_RE)].map((m) => ({
        statement: "fact",
        citations: [m[1]],
      }));
      const sufficient = (calls["compose-answer"] ?? 0) > sufficientAfter;
      return out({ claims, suggestions: [], sufficient, missing: sufficient ? null : "more" });
    }
    default:
      throw new Error(`unexpected call ${spec.name}`);
  }
};

/** Index each section's title + summary for FTS so hybrid search returns real hits. */
const blocks = async (resource: Resource): Promise<SearchBlock[]> => {
  const summary = await resource.getAdapter(WikiPageSummary)?.get();
  if (!summary) return [];
  return summary.sections.map((s) => ({ blockId: s.key, text: `${s.title} ${s.summary}` }));
};

async function buildProject() {
  const filesApi = new MemFilesApi({
    initialFiles: { "proj/a.md": "Acme is a company.\nJane founded Acme." },
  });
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  registerContentExtraction(repository);
  registerKnowledgeAdapters(repository);
  registerStubLlm(repository, {
    generateObject,
    embed,
    embedModel: "fixture",
    dimensionality: DIM,
  });
  registerSearch(repository, { embed, model: "fixture", dimensionality: DIM, blocks });
  registerQuery(repository);

  const workspace = repository.requireAdapter<Workspace>(Workspace);
  const project = await workspace.getProject("proj", true);
  if (!project) throw new Error("no project");
  const builder = project.requireAdapter(ProjectBuilder);
  builder.registerBuilder(contentBuilder());
  builder.registerBuilder(summarizeBuilder());
  builder.registerBuilder(metaBuilder());
  builder.registerBuilder(reorganizeBuilder());
  builder.registerBuilder(searchBuilder({ inputSignal: "summarized" }));
  for await (const _ of builder.run()) {
    // drain
  }
  return project;
}

describe("WikiQuery — FSM-driven retrieval", () => {
  let project: Awaited<ReturnType<typeof buildProject>>;

  beforeEach(async () => {
    intent = { onCorpus: true, subjects: [{ prompt: "Who founded Acme?" }] };
    selectedTopicKeys = undefined;
    calls = {};
    foldSections = [];
    sufficientAfter = 0;
    project = await buildProject();
  });

  it("returns a QueryProgress synchronously and resolves a cited answer", async () => {
    const progress = project.requireAdapter(WikiQuery).ask("Who founded Acme?");
    expect(typeof progress.complete).toBe("function");
    const answer = await progress.complete();
    expect(answer.text).toMatch(/\[\[\/a\.md#\w+\]\]/);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.evidenceCount).toBeGreaterThan(0);
  });

  it("dedupes a section surfaced by both retrieval front-ends by (uri, sectionKey)", async () => {
    const progress = project.requireAdapter(WikiQuery).ask("Acme founders?");
    await progress.complete();
    const keys = progress.evidence.map((e) => `${e.uri}#${e.sectionKey}`);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
  });

  it("fans retrieval out per subject, then filters sections once globally", async () => {
    intent = {
      onCorpus: true,
      subjects: [{ prompt: "Who founded Acme?" }, { prompt: "What is Acme?" }],
    };
    await project.requireAdapter(WikiQuery).ask("Acme + founders").complete();
    // The class ladder runs once per subject; the relevance filter runs once over the pool.
    expect(calls["topic-select"]).toBe(2);
    expect(calls["section-select"]).toBe(1);
  });

  it("escalates to the next tier when the first answer reports missing information", async () => {
    // First compose reports insufficient → escalate; second is sufficient.
    sufficientAfter = 1;
    const answer = await project.requireAdapter(WikiQuery).ask("Who founded Acme?").complete();
    // Two filter passes (intersection tier, then the remainder) and two compose attempts.
    expect(calls["section-select"]).toBe(2);
    expect(calls["compose-answer"]).toBe(2);
    // Evidence accumulated across both tiers: the score-2 `founders` and the score-1 `intro`.
    const keys = answer.citations;
    expect(answer.evidenceCount).toBe(2);
    expect(keys.some((c) => c.includes("#founders"))).toBe(true);
    expect(keys.some((c) => c.includes("#intro"))).toBe(true);
  });

  it("summarizes in batches exposing the section XML tags, with no rolling state", async () => {
    await project.requireAdapter(WikiQuery).ask("Who founded Acme?").complete();
    expect(foldSections.length).toBeGreaterThan(0);
    for (const batch of foldSections) {
      expect(batch).toContain("<section_title");
      expect(batch).toContain("<section_description>");
      expect(batch).toContain("<raw_content>");
      // Batch summarization is stateless — no carried-over rolling summary.
      expect(batch).not.toContain("<previous_summary>");
    }
  });

  it("grounds every surviving citation in a retrieved section", async () => {
    const answer = await project.requireAdapter(WikiQuery).ask("Who founded Acme?").complete();
    for (const c of answer.citations) expect(c).toMatch(/^\/a\.md#/);
  });

  it("returns a terminal negative answer when there is no evidence", async () => {
    selectedTopicKeys = () => []; // class ladder yields nothing
    intent = { onCorpus: true, subjects: [{ prompt: "quizzaciously unrelated xyzzy" }] };
    const answer = await project.requireAdapter(WikiQuery).ask("Unrelated?").complete();
    expect(answer.evidenceCount).toBe(0);
    expect(answer.text).toMatch(/no supporting evidence/i);
    expect(answer.topics).toEqual([]);
    expect(answer.outliers).toEqual([]);
  });

  it("returns a terminal negative answer for an off-corpus prompt without retrieving", async () => {
    intent = { onCorpus: false, subjects: [], offCorpusReason: "asks about cooking" };
    const answer = await project.requireAdapter(WikiQuery).ask("How do I bake bread?").complete();
    expect(answer.evidenceCount).toBe(0);
    expect(answer.text).toMatch(/outside the wiki/i);
    expect(calls["topic-select"]).toBeUndefined(); // retrieval never ran
  });

  it("notifies onChange listeners and records stages as the run progresses", async () => {
    const progress = project.requireAdapter(WikiQuery).ask("Who founded Acme?");
    let count = 0;
    const off = progress.onChange(() => count++);
    await progress.complete();
    off();
    expect(count).toBeGreaterThan(0);
    expect(progress.stages.map((s) => s.name)).toContain("respond");
  });

  it("aggregates topics from the evidence pages onto the answer", async () => {
    const answer = await project.requireAdapter(WikiQuery).ask("Who founded Acme?").complete();
    const topic = answer.topics.find((t) => t.key === "company-founders");
    expect(topic).toBeDefined();
    expect(topic?.name).toBe("Company founders");
    expect(topic?.citations.some((c) => c.uri.includes("a.md#founders"))).toBe(true);
  });
});
