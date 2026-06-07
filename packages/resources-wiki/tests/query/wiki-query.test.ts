import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ProjectBuilder,
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
  type LlmCaller,
  type LlmModels,
  metaBuilder,
  type ReformulationOutput,
  registerContentExtraction,
  registerKnowledgeAdapters,
  registerQuery,
  registerSearch,
  reorganizeBuilder,
  searchBuilder,
  summarizeBuilder,
  WikiQuery,
} from "../../src/index.js";

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("acme")) v[0] = 1;
  if (text.toLowerCase().includes("founder")) v[1] = 1;
  return v;
};

const SUMMARY: DocumentSummaryOutput = {
  title: "Acme",
  summary: "Acme and its founders.",
  sections: [
    {
      key: "intro",
      title: "Intro",
      startLine: 0,
      endLine: 0,
      summary: "Acme is a company.",
    },
    {
      key: "founders",
      title: "Founders",
      startLine: 1,
      endLine: 1,
      summary: "Jane founded Acme.",
    },
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

// Reformulation routing is controlled per-test by mutating this.
let reformulation: ReformulationOutput = {};

function stubLlm(): LlmCaller {
  return {
    generate: async (spec) => {
      const usage = { inputTokens: 0, outputTokens: 0 };
      if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
      if (spec.name === "extract-document-meta") return { output: META as unknown as never, usage };
      if (spec.name === "reformulate-query")
        return { output: reformulation as unknown as never, usage };
      if (spec.name === "compose-answer") {
        // Cite whatever evidence we were given (first section), as a [[wiki://...]] marker.
        const input = spec.input as {
          evidence: { uri: string; sectionKey: string }[];
        };
        const first = input.evidence[0];
        const text = first
          ? `Answer. [[wiki://proj/${first.uri}#${first.sectionKey}]]`
          : "No supporting evidence found.";
        return {
          output: {
            text,
            citations: first ? [`wiki://proj/${first.uri}#${first.sectionKey}`] : [],
            suggestions: [],
          } as unknown as never,
          usage,
        };
      }
      throw new Error(`unexpected call ${spec.name}`);
    },
  };
}

const models = { default: {} } as unknown as LlmModels;

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
  const llm = stubLlm();
  registerContentExtraction(repository);
  registerKnowledgeAdapters(repository);
  registerSearch(repository, {
    embed,
    model: "fixture",
    dimensionality: DIM,
    blocks: async () => [],
  });
  registerQuery(repository, { models, llm });

  const workspace = repository.requireAdapter<Workspace>(Workspace);
  const project = await workspace.getProject("proj", true);
  if (!project) throw new Error("no project");
  const builder = project.requireAdapter(ProjectBuilder);
  builder.registerBuilder(contentBuilder());
  builder.registerBuilder(summarizeBuilder({ models, llm }));
  builder.registerBuilder(metaBuilder({ models, llm }));
  builder.registerBuilder(reorganizeBuilder());
  // Index sections for search: fts over summary, vector over summary.
  builder.registerBuilder(searchBuilder({ inputSignal: "summarized" }));
  for await (const _ of builder.run()) {
    // drain
  }
  return project;
}

describe("WikiQuery — routed retrieval", () => {
  let project: Awaited<ReturnType<typeof buildProject>>;

  beforeEach(async () => {
    reformulation = {};
    project = await buildProject();
  });

  it("returns a QueryProgress synchronously and resolves a cited answer", async () => {
    reformulation = { topicDescent: ["company-founders"] };
    const query = project.requireAdapter(WikiQuery);
    const progress = query.ask("Who founded Acme?");
    expect(typeof progress.complete).toBe("function");
    const answer = await progress.complete();
    expect(answer.text).toMatch(/\[\[wiki:\/\/proj\/a\.md#\w+\]\]/);
  });

  it("dedupes a section surfaced by both branches by (uri, sectionKey)", async () => {
    // Both branches point at the same doc → its sections must appear once.
    reformulation = {
      semanticQueries: ["acme"],
      topicDescent: ["company-founders"],
    };
    const query = project.requireAdapter(WikiQuery);
    const progress = query.ask("Acme founders?");
    await progress.complete();
    const keys = progress.evidence.map((e) => `${e.uri}#${e.sectionKey}`);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
  });

  it("returns a terminal negative answer when there is no evidence", async () => {
    reformulation = { topicDescent: ["nonexistent-topic"] };
    const query = project.requireAdapter(WikiQuery);
    const answer = await query.ask("Unrelated?").complete();
    expect(answer.evidenceCount).toBe(0);
    expect(answer.text).toMatch(/no supporting evidence/i);
  });
});
