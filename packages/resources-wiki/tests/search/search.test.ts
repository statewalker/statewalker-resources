import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ProjectBuilder,
  type Resource,
  ResourceRepository,
  SOURCES_SIGNAL,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type EmbedFn,
  registerContentExtraction,
  registerSearch,
  SearchAdapter,
  type SearchBlock,
  searchBuilder,
} from "../../src/index.js";

// A tiny deterministic embedder: each block embeds to a one-hot-ish vector keyed
// by which fixture keyword it contains, so vector search is predictable.
const DIM = 4;
const KEYWORDS = ["alpha", "bravo", "charlie", "delta"];
function vec(text: string): Float32Array {
  const v = new Float32Array(DIM);
  KEYWORDS.forEach((k, i) => {
    if (text.toLowerCase().includes(k)) v[i] = 1;
  });
  return v;
}
// Query-time embedder (corpus vectors are precomputed on the blocks below).
const embed: EmbedFn = async (text) => vec(text);

// Fixture sections per source URI, each with a precomputed embedding (as the
// Embedder stage would have produced).
const SECTIONS: Record<string, SearchBlock[]> = {
  "a.md": [
    { blockId: "intro", text: "alpha alpha intro", embedding: vec("alpha") },
    { blockId: "body", text: "bravo body text", embedding: vec("bravo") },
  ],
  "b.md": [{ blockId: "main", text: "charlie main content", embedding: vec("charlie") }],
};

const blocks = async (_resource: Resource, uri: string): Promise<SearchBlock[]> =>
  SECTIONS[uri] ?? [];

function newRepository() {
  const filesApi = new MemFilesApi({ initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" } });
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  registerContentExtraction(repository);
  registerSearch(repository, { embed, model: "fixture", dimensionality: DIM, blocks });
  return repository;
}

describe("SearchAdapter", () => {
  let repository: ResourceRepository;

  beforeEach(() => {
    repository = newRepository();
  });

  async function buildAndSearch() {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = (await workspace.getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);
    builder.registerBuilder(searchBuilder({ inputSignal: SOURCES_SIGNAL }));
    for await (const _ of builder.run()) {
      // drain
    }
    return project.requireAdapter(SearchAdapter);
  }

  it("returns hybrid hits grouped by document with blockId === sectionKey", async () => {
    const search = await buildAndSearch();
    const results = await search.search({ query: "alpha" });
    const a = results.find((r) => r.uri === "a.md");
    expect(a).toBeDefined();
    expect(a?.sections.some((s) => s.sectionKey === "intro")).toBe(true);
  });

  it("records the embedding model and dimensionality in the index config", async () => {
    await buildAndSearch();
    const filesApi = (repository as unknown as { filesApi: MemFilesApi }).filesApi;
    const cfg = JSON.parse(
      await (async () => {
        let text = "";
        for await (const chunk of filesApi.read("proj/.project/index/search.json")) {
          text += new TextDecoder().decode(chunk);
        }
        return text;
      })(),
    );
    expect(cfg.model).toBe("fixture");
    expect(cfg.dimensionality).toBe(DIM);
  });

  it("restricts to full-text when modes:['fts']", async () => {
    const search = await buildAndSearch();
    const results = await search.search({ query: "charlie", modes: ["fts"] });
    expect(results.find((r) => r.uri === "b.md")).toBeDefined();
  });

  it("persists the index and loads it on a fresh adapter without rebuilding", async () => {
    await buildAndSearch();
    const filesApi = (repository as unknown as { filesApi: MemFilesApi }).filesApi;

    // The serialized index lives under index/search/.
    const persisted: string[] = [];
    for await (const info of filesApi.list("proj/.project/index/search", { recursive: true })) {
      if (info.kind === "file") persisted.push(info.path);
    }
    expect(persisted.length).toBeGreaterThan(0);

    // A fresh repository over the SAME files searches the loaded index — the block
    // provider throws if touched, proving no query-time rebuild/re-embedding occurs.
    const repo2 = new ResourceRepository({ filesApi });
    repo2.register("", ContentReadAdapter);
    repo2.register("", ContentWriteAdapter);
    repo2.register("", TextAdapter);
    repo2.register("", Project);
    repo2.register("", ProjectBuilder);
    repo2.register(ResourceRepository, Workspace);
    registerContentExtraction(repo2);
    registerSearch(repo2, {
      embed,
      model: "fixture",
      dimensionality: DIM,
      blocks: async () => {
        throw new Error("block provider must not be called on a loaded index");
      },
    });
    const project2 = (await repo2.requireAdapter<Workspace>(Workspace).getProject("proj"))!;
    const results = await project2.requireAdapter(SearchAdapter).search({ query: "alpha" });
    expect(results.find((r) => r.uri === "a.md")).toBeDefined();
  });
});

describe("SearchAdapter wiki-free contract", () => {
  it("imports no wiki-specific modules", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/search/search-adapter.ts"),
      "utf8",
    );
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec).not.toMatch(/\/(uri|knowledge|answers)\b/);
    }
    expect(src).not.toMatch(/\bWiki[A-Z]/);
  });
});
