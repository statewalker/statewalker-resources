import type { DocumentPath, EmbedFn, Index, SearchRequest } from "@statewalker/indexer-api";
import {
  type FullTextBlock,
  type FulltextQuery,
  newFullTextAccess,
} from "@statewalker/indexer-fulltext";
import { createFlexSearchIndexer } from "@statewalker/indexer-mem-flexsearch";
import { newVectorAccess, type VectorBlock, type VectorQuery } from "@statewalker/indexer-vector";
import {
  type Adaptable,
  concatPath,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
  type Resource,
  ResourceAdapter,
  type ResourceRepository,
  SOURCES_REMOVED_SIGNAL,
} from "@statewalker/resources-workspace";
import { writeJsonAtomic } from "../util/io.js";

const FTS_SUB = "fts";
const VEC_SUB = "vec";
const DEFAULT_SYSTEM_FOLDER = ".project";

const ftsAccess = newFullTextAccess(FTS_SUB);
const vecAccess = newVectorAccess(VEC_SUB);

/** A unit of indexable content: full-text `text` and optional `vectorText` to embed. */
export interface SearchBlock {
  blockId: string;
  text: string;
  vectorText?: string;
}

/** Maps a source resource (and its project-relative uri) to its indexable blocks. */
export type SearchBlocksProvider = (resource: Resource, uri: string) => Promise<SearchBlock[]>;

export interface SearchDeps {
  embed: EmbedFn;
  model: string;
  dimensionality: number;
  blocks: SearchBlocksProvider;
}

export interface SearchQuery {
  query: string;
  modes?: ("fts" | "vector")[];
  paths?: string[];
  topK?: number;
}

export interface DocumentMatch {
  uri: string;
  sections: { sectionKey: string; score: number; snippet?: string }[];
}

interface AdapterOptions extends Record<string, unknown>, SearchDeps {}

const DEFAULT_TOP_K = 20;

function toDocumentPath(uri: string): DocumentPath {
  return `/${uri.replace(/^\/+/, "")}`;
}
function fromDocumentPath(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Project-relative uri of a resource (path minus the leading project segment). */
function projectRelative(resource: Resource, projectPath: string): string {
  const base = projectPath.replace(/^\/+|\/+$/g, "");
  const p = resource.path.replace(/^\/+/, "");
  if (base === "") return p;
  return p.startsWith(`${base}/`) ? p.slice(base.length + 1) : "";
}

function isSource(uri: string): boolean {
  return uri.length > 0 && !uri.split("/").some((seg) => seg.startsWith("."));
}

/**
 * Project-level hybrid (full-text + vector) search over a project's indexable
 * blocks. Wiki-free by contract: it references no wiki types — content is supplied
 * through an injected `SearchBlocksProvider` and an `EmbedFn`, so it can be lifted
 * to a standalone `resources-search` package unchanged.
 *
 * The index is held in memory and rebuilt from the project's blocks on first use
 * when empty (the persisted FTS+vector backend is a deferred decision); the model
 * and dimensionality are recorded in `<project>/<systemFolder>/index/search.json`.
 */
export class SearchAdapter extends ResourceAdapter {
  private index?: Index;
  private built = false;

  private get opts(): AdapterOptions {
    return this.options as AdapterOptions;
  }
  private get filesApi() {
    return (this.repository as ResourceRepository).filesApi;
  }
  private get systemFolder(): string {
    return (this.repository.options.systemFolder as string | undefined) ?? DEFAULT_SYSTEM_FOLDER;
  }
  private get projectPath(): string {
    return this.resource.path.replace(/^\/+|\/+$/g, "");
  }
  private configPath(): string {
    return concatPath(this.projectPath, this.systemFolder, "index", "search.json");
  }

  private async ensureIndex(): Promise<Index> {
    if (!this.index) {
      const indexer = createFlexSearchIndexer();
      this.index = await indexer.createIndex({
        name: "wiki-search",
        subIndexes: {
          [FTS_SUB]: { type: "fulltext", language: "en" },
          [VEC_SUB]: {
            type: "vector",
            dimensionality: this.opts.dimensionality,
            model: this.opts.model,
          },
        },
      });
      await writeJsonAtomic(this.filesApi, this.configPath(), {
        model: this.opts.model,
        dimensionality: this.opts.dimensionality,
      });
    }
    return this.index;
  }

  /** Re-index one source resource (delete prior blocks, add current). */
  async indexPage(resource: Resource, uri: string): Promise<void> {
    const index = await this.ensureIndex();
    const fullTextIndex = ftsAccess.get(index);
    const vectorIndex = vecAccess.get(index);

    const path = toDocumentPath(uri);
    await fullTextIndex.deleteDocuments([{ path }]);
    await vectorIndex.deleteDocuments([{ path }]);

    const blocks = await this.opts.blocks(resource, uri);
    if (blocks.length === 0) return;

    const ftsBlocks: FullTextBlock[] = blocks.map((b) => ({
      path,
      blockId: b.blockId,
      content: b.text,
    }));
    await fullTextIndex.addDocument(ftsBlocks);

    const vecBlocks: VectorBlock[] = [];
    for (const b of blocks) {
      vecBlocks.push({
        path,
        blockId: b.blockId,
        embedding: await this.opts.embed(b.vectorText ?? b.text),
      });
    }
    await vectorIndex.addDocument(vecBlocks);

    await fullTextIndex.flush();
    await vectorIndex.flush();
  }

  /** Remove a source's blocks from the index. */
  async removePage(uri: string): Promise<void> {
    if (!this.index) return;
    const path = toDocumentPath(uri);
    const fullTextIndex = ftsAccess.get(this.index);
    const vectorIndex = vecAccess.get(this.index);
    await fullTextIndex.deleteDocuments([{ path }]);
    await vectorIndex.deleteDocuments([{ path }]);
  }

  private async ensureBuilt(): Promise<Index> {
    const index = await this.ensureIndex();
    const fullTextIndex = ftsAccess.get(index);
    if (this.built) return index;
    if ((await fullTextIndex.getSize()) === 0) {
      const repository = this.repository as ResourceRepository;
      for await (const resource of repository.getResources(this.resource.path, true)) {
        const uri = projectRelative(resource, this.projectPath);
        if (isSource(uri)) await this.indexPage(resource, uri);
      }
    }
    this.built = true;
    return index;
  }

  /** Hybrid (RRF) search, grouped by document. */
  async search(query: SearchQuery): Promise<DocumentMatch[]> {
    const index = await this.ensureBuilt();
    const modes = query.modes ?? ["fts", "vector"];
    const request: SearchRequest = { topK: query.topK ?? DEFAULT_TOP_K };
    if (query.paths) request.paths = query.paths.map(toDocumentPath);
    if (modes.includes("fts")) {
      ftsAccess.setQuery(request, {
        queries: [query.query],
      } satisfies FulltextQuery);
    }
    if (modes.includes("vector")) {
      vecAccess.setQuery(request, {
        embeddings: [await this.opts.embed(query.query)],
      } satisfies VectorQuery);
    }

    const byDoc = new Map<string, DocumentMatch>();
    for await (const r of index.search(request)) {
      const uri = fromDocumentPath(r.path);
      const match = byDoc.get(uri) ?? { uri, sections: [] };
      match.sections.push({
        sectionKey: r.blockId,
        score: r.score,
        snippet: ftsAccess.getResult(r)?.snippet,
      });
      byDoc.set(uri, match);
    }
    return [...byDoc.values()];
  }
}

/** Register `SearchAdapter` (project-level) with its embedder / block provider. */
export function registerSearch(repository: ResourceRepository, deps: SearchDeps): () => void {
  return repository.register("", SearchAdapter, (adaptable: Adaptable) => {
    const options: AdapterOptions = {
      embed: deps.embed,
      model: deps.model,
      dimensionality: deps.dimensionality,
      blocks: deps.blocks,
    };
    return new SearchAdapter(adaptable, options);
  });
}

/**
 * The index builder: on each `inputSignal` update re-indexes that page's blocks;
 * on `sources:removed`, removes its blocks. Generic — the blocks come from the
 * injected provider on the `SearchAdapter`.
 */
export function searchBuilder(opts: { inputSignal: string }): RegisteredBuilder {
  const { inputSignal } = opts;
  return {
    id: "SearchIndexer",
    inputs: [inputSignal, SOURCES_REMOVED_SIGNAL],
    outputs: [],
    // biome-ignore lint/correctness/useYield: maintains an index; emits no signal
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const search = project.requireAdapter(SearchAdapter);
      const log = loggerOf(project, "SearchIndexer");
      for await (const u of builder.readUpdates({
        signal: inputSignal,
        cell: "SearchIndexer",
      })) {
        const resource = await project.getProjectResource(u.uri);
        if (resource) {
          log.debug("indexing page", { uri: u.uri });
          await search.indexPage(resource, u.uri);
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      for await (const u of builder.readUpdates({
        signal: SOURCES_REMOVED_SIGNAL,
        cell: "SearchIndexer",
      })) {
        log.debug("removing page", { uri: u.uri });
        await search.removePage(u.uri);
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      return true;
    },
  };
}
