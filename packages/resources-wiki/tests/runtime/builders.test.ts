import type { EmbedFn } from "@statewalker/indexer-api";
import { type FilesApi, ResourceRepository, Workspace } from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DocumentMetaOutput,
  type LlmCaller,
  type LlmModels,
  registerWiki,
  WikiPageGraph,
  WikiPageMeta,
  WikiPageSummary,
  WikiTopicIndex,
  wireWikiProject,
} from "../../src/index.js";

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  v[0] = text.length % 2;
  v[1] = text.length % 3;
  return v;
};

/** Tracks LLM calls and derives outputs from the input so freshness is observable. */
function tracker() {
  const calls: { name: string; uri?: string }[] = [];
  // Per-uri topic key, mutable so a test can drop a topic on re-ingest.
  const topicByUri = new Map<string, string>();
  const llm: LlmCaller = {
    generate: async (spec) => {
      const input = spec.input as { uri?: string; rawLines?: [number, string][] };
      calls.push({ name: spec.name, uri: input.uri });
      const out = (o: unknown) => ({
        output: o as never,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      switch (spec.name) {
        case "summarize-document": {
          // Title echoes the FIRST raw line so a stale cache is detectable.
          const firstLine = input.rawLines?.[0]?.[1] ?? "";
          return out({
            title: firstLine,
            summary: firstLine,
            sections: [{ key: "s", title: "S", startLine: 0, endLine: 0, summary: firstLine }],
          });
        }
        case "extract-document-meta": {
          const uri = input.uri ?? "";
          const key = topicByUri.get(uri);
          const meta: DocumentMetaOutput = key
            ? {
                topics: [{ key, name: key, description: "d", sectionKeys: ["s"], brief: "b" }],
                outliers: [],
              }
            : { topics: [], outliers: [] };
          return out(meta);
        }
        case "extract-document-graph":
          return out({
            sections: [{ sectionKey: "s", entities: [], statements: [], relations: [] }],
          });
        default:
          throw new Error(`unexpected ${spec.name}`);
      }
    },
  };
  return { llm, calls, topicByUri };
}

const models = { default: {} } as unknown as LlmModels;

async function writeFile(filesApi: FilesApi, path: string, text: string): Promise<void> {
  await filesApi.write(
    path,
    (async function* () {
      yield new TextEncoder().encode(text);
    })(),
  );
}

describe("wiki builders — incremental behaviour", () => {
  let filesApi: MemFilesApi;
  let repository: ResourceRepository;
  let t: ReturnType<typeof tracker>;

  beforeEach(() => {
    filesApi = new MemFilesApi({
      initialFiles: { "proj/a.md": "Acme.", "proj/b.md": "Bravo." },
    });
    repository = new ResourceRepository({ filesApi });
    t = tracker();
    t.topicByUri.set("a.md", "alpha");
    t.topicByUri.set("b.md", "bravo");
    registerWiki(repository, { models, llm: t.llm, embed, embedModel: "fx", dimensionality: DIM });
  });

  const deps = () => ({ models, llm: t.llm, embed, embedModel: "fx", dimensionality: DIM });

  async function openProject() {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    return project;
  }

  async function scan(project: Awaited<ReturnType<typeof openProject>>) {
    const builder = wireWikiProject(project, deps());
    for await (const _ of builder.run()) {
      // drain
    }
    return builder;
  }

  it("re-summarizes ONLY the changed page, with fresh content", async () => {
    const project = await openProject();
    await scan(project);
    expect(
      t.calls
        .filter((c) => c.name === "summarize-document")
        .map((c) => c.uri)
        .sort(),
    ).toEqual(["a.md", "b.md"]);

    // Change a.md only.
    t.calls.length = 0;
    await writeFile(filesApi, "proj/a.md", "Globex.");
    await scan(project);

    const summarized = t.calls.filter((c) => c.name === "summarize-document").map((c) => c.uri);
    expect(summarized).toEqual(["a.md"]); // b.md untouched

    // The new summary reflects the NEW content (cache was refreshed, not stale).
    const resource = await project.getProjectResource("a.md");
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    expect(summary?.title).toBe("Globex.");
  });

  it("is a no-op when nothing changed", async () => {
    const project = await openProject();
    await scan(project);
    t.calls.length = 0;
    await scan(project);
    expect(t.calls).toEqual([]);
  });

  it("removing a source prunes its page artifacts and global topic reference", async () => {
    const project = await openProject();
    await scan(project);
    expect(
      (await project.requireAdapter(WikiTopicIndex).get("bravo"))?.references.map((r) => r.uri),
    ).toEqual(["b.md"]);

    await filesApi.remove("proj/b.md");
    await scan(project);

    // Page artifacts gone, and the topic the source contributed is pruned.
    const resource = await project.getProjectResource("b.md");
    expect(await resource?.requireAdapter(WikiPageSummary).get()).toBeUndefined();
    expect(await resource?.requireAdapter(WikiPageMeta).get()).toBeUndefined();
    expect(await resource?.requireAdapter(WikiPageGraph).get()).toBeUndefined();
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeUndefined();
  });

  it("dropping a topic on re-ingest updates the global topic index", async () => {
    const project = await openProject();
    await scan(project);
    expect(await project.requireAdapter(WikiTopicIndex).get("alpha")).toBeDefined();

    // a.md no longer declares the 'alpha' topic; force re-ingest by changing content.
    t.topicByUri.delete("a.md");
    await writeFile(filesApi, "proj/a.md", "Acme v2.");
    await scan(project);

    expect(await project.requireAdapter(WikiTopicIndex).get("alpha")).toBeUndefined();
  });

  it("restartFrom('summarize') re-derives the page summary downstream", async () => {
    const project = await openProject();
    await scan(project);

    const builder = wireWikiProject(project, deps());
    await builder.restartFrom("summarize");
    t.calls.length = 0;
    for await (const _ of builder.run()) {
      // drain
    }
    // Summarizer (and the meta/graph/search downstream) re-ran for both pages.
    expect(
      t.calls
        .filter((c) => c.name === "summarize-document")
        .map((c) => c.uri)
        .sort(),
    ).toEqual(["a.md", "b.md"]);
  });
});
