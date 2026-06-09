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
  type LlmApi,
  metaBuilder,
  pruneBuilder,
  registerContentExtraction,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
  WikiTopicIndex,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

const SUMMARY: DocumentSummaryOutput = {
  title: "Doc",
  summary: "About founders.",
  sections: [{ key: "s", title: "S", startLine: 0, endLine: 0, summary: "founders" }],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "company-founders",
      name: "Company founders",
      description: "People who found companies.",
      sectionKeys: ["s"],
      brief: "This doc mentions founders.",
    },
  ],
  outliers: [],
};

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
  if (spec.name === "extract-document-meta") return { output: META as unknown as never, usage };
  throw new Error(`unexpected call ${spec.name}`);
};

describe("reorganizer + pruner", () => {
  let repository: ResourceRepository;
  let filesApi: MemFilesApi;

  beforeEach(() => {
    filesApi = new MemFilesApi({ initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" } });
    repository = new ResourceRepository({ filesApi });
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("", TextAdapter);
    repository.register("", Project);
    repository.register("", ProjectBuilder);
    repository.register(ResourceRepository, Workspace);
    registerContentExtraction(repository);
    registerKnowledgeAdapters(repository);
    registerStubLlm(repository, { generateObject });
  });

  it("aggregates a topic across documents, and prunes a removed source's reference", async () => {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = (await workspace.getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);

    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder());
    builder.registerBuilder(metaBuilder());
    builder.registerBuilder(reorganizeBuilder());
    builder.registerBuilder(pruneBuilder());

    for await (const _ of builder.run()) {
      // drain
    }

    // Both docs declared `company-founders` → one global topic, referencing each
    // document's specific topic declaration (`<uri>#<topicKey>`).
    const topic = await project.requireAdapter(WikiTopicIndex).get("company-founders");
    expect(topic?.references.map((r) => r.uri).sort()).toEqual([
      "a.md#company-founders",
      "b.md#company-founders",
    ]);

    // Remove one source; the next run detects the deletion, reorganizes, and prunes.
    await filesApi.remove("proj/b.md");
    for await (const _ of builder.run()) {
      // drain
    }

    const after = await project.requireAdapter(WikiTopicIndex).get("company-founders");
    expect(after?.references.map((r) => r.uri)).toEqual(["a.md#company-founders"]);
  });
});
