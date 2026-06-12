import type { EmbedFn } from "@statewalker/indexer-api";
import { type FilesApi, ResourceRepository, Workspace } from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DocumentMetaOutput,
  type LlmApi,
  ResourceTextContentCache,
  registerWiki,
  WikiPageEmbeddings,
  WikiPageMeta,
  WikiPageSummary,
  WikiTopicIndex,
  wireWikiProject,
} from "../../src/index.js";
import { makeStubLlm } from "../util/stub-llm.js";

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
  const generateObject: LlmApi["generateObject"] = async (spec) => {
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
      case "reorganize-topics":
        // No semantic merges — the reorganizer's fallback coins each leftover
        // by its own key, preserving the mechanical exact-key behaviour.
        return out({ actions: [] });
      default:
        throw new Error(`unexpected ${spec.name}`);
    }
  };
  const llm = makeStubLlm({ generateObject, embed });
  return { llm, calls, topicByUri };
}

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
    registerWiki(repository, {
      llm: t.llm,
      models: { default: "fx-model" },
      embedModel: "fx",
      dimensionality: DIM,
    });
  });

  async function openProject() {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    return project;
  }

  async function scan(project: Awaited<ReturnType<typeof openProject>>) {
    const builder = wireWikiProject(project);
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
    ).toEqual(["b.md#bravo"]);

    await filesApi.remove("proj/b.md");
    await scan(project);

    // Page artifacts gone, and the topic the source contributed is pruned.
    const resource = await project.getProjectResource("b.md");
    expect(await resource?.requireAdapter(WikiPageSummary).get()).toBeUndefined();
    expect(await resource?.requireAdapter(WikiPageMeta).get()).toBeUndefined();
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

  it("restartFrom('Summarizer') re-triggers but hash-skips unchanged pages (no LLM)", async () => {
    const project = await openProject();
    await scan(project);

    const builder = wireWikiProject(project);
    await builder.restartFrom("Summarizer");
    t.calls.length = 0;
    for await (const _ of builder.run()) {
      // drain
    }
    // Re-triggered, but the source hash is unchanged → the summarizer does no work.
    expect(t.calls.filter((c) => c.name === "summarize-document")).toEqual([]);
  });

  it("invalidating Summarizer rebuilds a deleted downstream artifact without LLM (emit-on-skip)", async () => {
    const project = await openProject();
    await scan(project);
    const resource = await project.getProjectResource("a.md");
    // The Embedder produced embeddings during the scan: JSON metadata + the Arrow
    // sidecar, decoded back into per-section Float32Array vectors.
    expect(await resource?.requireAdapter(WikiPageEmbeddings).getMeta("fx", DIM)).toBeDefined();
    const vectors = await resource?.requireAdapter(WikiPageEmbeddings).getVectors("fx", DIM);
    expect(vectors?.get("s")).toBeInstanceOf(Float32Array);
    expect(vectors?.get("s")?.length).toBe(DIM);

    // Delete the embeddings artifact, then invalidate Summarizer (+ downstream).
    await filesApi.remove("proj/.project/pages/a.md/embeddings.fx.2.json");
    const builder = wireWikiProject(project);
    await builder.restartFrom("Summarizer");
    t.calls.length = 0;
    for await (const _ of builder.run()) {
      // drain
    }

    // No LLM: summaries/meta are fresh and hash-skip. But the Summarizer re-emits
    // `summarized`, so the Embedder re-runs and recreates the deleted embeddings.
    expect(t.calls.filter((c) => c.name === "summarize-document")).toEqual([]);
    expect(t.calls.filter((c) => c.name === "extract-document-meta")).toEqual([]);
    expect(await resource?.requireAdapter(WikiPageEmbeddings).getMeta("fx", DIM)).toBeDefined();
  });

  it("force re-derives every page even when the source hash is unchanged", async () => {
    const project = await openProject();
    await scan(project);

    const builder = wireWikiProject(project, { force: true });
    await builder.restartFrom("Summarizer");
    t.calls.length = 0;
    for await (const _ of builder.run()) {
      // drain
    }
    expect(
      t.calls
        .filter((c) => c.name === "summarize-document")
        .map((c) => c.uri)
        .sort(),
    ).toEqual(["a.md", "b.md"]);
  });

  it("skips re-summarization when content is unchanged despite a new mtime (hash-gated)", async () => {
    const project = await openProject();
    await scan(project);
    t.calls.length = 0;
    // Rewrite a.md with IDENTICAL content → new mtime, same source hash.
    await writeFile(filesApi, "proj/a.md", "Acme.");
    await scan(project);
    expect(t.calls.filter((c) => c.name === "summarize-document")).toEqual([]);
  });

  it("records the source hash in raw.meta.json and stamps it onto the page artifacts", async () => {
    const project = await openProject();
    await scan(project);
    const resource = await project.getProjectResource("a.md");
    if (!resource) throw new Error("no resource");
    const rawMeta = await resource.requireAdapter(ResourceTextContentCache).getRawMeta();
    expect(rawMeta?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await resource.requireAdapter(WikiPageSummary).get())?.sourceHash).toBe(rawMeta?.hash);
    expect((await resource.requireAdapter(WikiPageMeta).get())?.sourceHash).toBe(rawMeta?.hash);
  });
});
