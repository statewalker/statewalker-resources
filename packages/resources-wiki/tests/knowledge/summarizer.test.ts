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
  type DocumentSummaryOutput,
  type LlmCaller,
  type LlmModels,
  ResourceTextContentCache,
  registerContentExtraction,
  registerKnowledgeAdapters,
  SUMMARIZED_SIGNAL,
  summarizeBuilder,
  WikiPageSummary,
} from "../../src/index.js";

const SUMMARY_OUTPUT: DocumentSummaryOutput = {
  title: "About Acme",
  summary: "Acme makes widgets and was founded in 1999.",
  sections: [
    { key: "overview", title: "Overview", startLine: 0, endLine: 1, summary: "Acme overview." },
    { key: "history", title: "History", startLine: 2, endLine: 3, summary: "Founded 1999." },
  ],
};

/** Stub caller: records the last input and returns a fixed summary. */
function stubLlm(): { llm: LlmCaller; lastInput: () => unknown } {
  let captured: unknown;
  return {
    lastInput: () => captured,
    llm: {
      generate: async (spec) => {
        captured = spec.input;
        return {
          output: SUMMARY_OUTPUT as unknown as never,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
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

describe("summarizeBuilder", () => {
  let repository: ResourceRepository;

  beforeEach(() => {
    repository = newRepository({
      "proj/a.md": "# Acme\n\nAcme makes widgets.\nFounded 1999.",
    });
  });

  async function getProject() {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj");
    if (!project) throw new Error("no project");
    return project;
  }

  it("page summary adapter is undefined before the builder has run", async () => {
    const project = await getProject();
    const resource = await project.getProjectResource("a.md");
    expect(await resource?.requireAdapter(WikiPageSummary).get()).toBeUndefined();
  });

  it("summarizes content into Sections, writes them, and emits summarized", async () => {
    const project = await getProject();
    const builder = project.requireAdapter(ProjectBuilder);
    const { llm, lastInput } = stubLlm();

    const summarizedUris: string[] = [];
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder({ models, llm }));
    builder.registerBuilder({
      id: "summarized-sink",
      inputs: [SUMMARIZED_SIGNAL],
      outputs: [],
      // biome-ignore lint/correctness/useYield: a sink records updates and emits nothing
      async *handler(p) {
        const b = p.requireAdapter(ProjectBuilder);
        for await (const u of b.readUpdates({
          signal: SUMMARIZED_SIGNAL,
          cell: "summarized-sink",
        })) {
          summarizedUris.push(u.uri);
          await u.handled();
        }
        return true;
      },
    });

    for await (const _ of builder.run()) {
      // drain
    }

    // The summarizer received the document's numbered raw lines.
    const input = lastInput() as { uri: string; rawLines: Array<[number, string]> };
    expect(input.uri).toBe("a.md");
    expect(input.rawLines[0]).toEqual([0, "# Acme"]);

    // The DocumentSummary was written and is readable via WikiPageSummary.
    const resource = await project.getProjectResource("a.md");
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    expect(summary?.title).toBe("About Acme");
    expect(summary?.sections.map((s) => s.key)).toEqual(["overview", "history"]);

    // Raw text was cached.
    const raw = await resource?.requireAdapter(ResourceTextContentCache).getTextContent();
    expect(raw).toContain("Acme makes widgets.");

    // `summarized` was emitted for the page.
    expect(summarizedUris).toEqual(["a.md"]);
  });
});
