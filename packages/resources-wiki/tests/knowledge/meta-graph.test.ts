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
  type DocumentGraphOutput,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  filterUnknownSubjects,
  graphBuilder,
  type LlmCaller,
  type LlmModels,
  metaBuilder,
  registerContentExtraction,
  registerKnowledgeAdapters,
  type SectionGraph,
  summarizeBuilder,
  WikiPageGraph,
  WikiPageMeta,
} from "../../src/index.js";

const SUMMARY: DocumentSummaryOutput = {
  title: "About Acme",
  summary: "Acme makes widgets.",
  sections: [
    { key: "overview", title: "Overview", startLine: 0, endLine: 1, summary: "Acme overview." },
  ],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "company-founders",
      name: "Company founders",
      description: "People who found companies.",
      sectionKeys: ["overview"],
      brief: "Acme was founded by Jane.",
    },
  ],
  outliers: [],
};
const GRAPH: DocumentGraphOutput = {
  sections: [
    {
      sectionKey: "overview",
      entities: [{ value: "Acme", type: "organisation" }],
      statements: [
        ["Acme", "makes", "widgets"],
        ["Ghost", "is", "undeclared"], // subject not an entity → must be dropped
      ],
      relations: [],
    },
  ],
};

function stubLlm(): LlmCaller {
  return {
    generate: async (spec) => {
      const usage = { inputTokens: 0, outputTokens: 0 };
      if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
      if (spec.name === "extract-document-meta") return { output: META as unknown as never, usage };
      if (spec.name === "extract-document-graph")
        return { output: GRAPH as unknown as never, usage };
      throw new Error(`unexpected call ${spec.name}`);
    },
  };
}

const models = { default: {} } as unknown as LlmModels;

function newRepository(files: Record<string, string>) {
  const repository = new ResourceRepository({ filesApi: new MemFilesApi({ initialFiles: files }) });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  registerContentExtraction(repository);
  registerKnowledgeAdapters(repository);
  return repository;
}

describe("filterUnknownSubjects", () => {
  it("drops triples whose subject is not a declared entity", () => {
    const sections: SectionGraph[] = [
      {
        sectionKey: "s",
        entities: [{ value: "Acme" }],
        statements: [
          ["Acme", "makes", "widgets"],
          ["Ghost", "is", "bad"],
        ],
        relations: [["Ghost", "rel", "Acme"]],
      },
    ];
    const [out] = filterUnknownSubjects(sections);
    expect(out.statements).toEqual([["Acme", "makes", "widgets"]]);
    expect(out.relations).toEqual([]);
  });
});

describe("meta + graph builders", () => {
  let repository: ResourceRepository;

  beforeEach(() => {
    repository = newRepository({ "proj/a.md": "# Acme\n\nAcme makes widgets." });
  });

  it("writes DocumentMeta and DocumentGraph, dropping orphan-subject triples", async () => {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = (await workspace.getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);
    const llm = stubLlm();

    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder({ models, llm }));
    builder.registerBuilder(metaBuilder({ models, llm }));
    builder.registerBuilder(graphBuilder({ models, llm }));

    for await (const _ of builder.run()) {
      // drain
    }

    const resource = (await project.getProjectResource("a.md"))!;

    const meta = await resource.requireAdapter(WikiPageMeta).get();
    expect(meta?.topics.map((t) => t.key)).toEqual(["company-founders"]);

    const graph = await resource.requireAdapter(WikiPageGraph).get();
    expect(graph?.sections[0].entities.map((e) => e.value)).toEqual(["Acme"]);
    // The orphan-subject statement ("Ghost") was dropped by validation.
    expect(graph?.sections[0].statements).toEqual([["Acme", "makes", "widgets"]]);
  });
});
