import type {
  DocumentPath,
  EmbedFn,
  Index,
  Indexer,
  SearchRequest,
} from "@statewalker/indexer-api";
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
import { FilesIndexerPersistence } from "./files-persistence.js";

const FTS_SUB = "fts";
const VEC_SUB = "vec";
const DEFAULT_SYSTEM_FOLDER = ".project";
const INDEX_NAME = "wiki-search";
/** Persist the index at most once per this interval while indexing. */
const SAVE_THROTTLE_MS = 2000;

const ftsAccess = newFullTextAccess(FTS_SUB);
const vecAccess = newVectorAccess(VEC_SUB);

/** A unit of indexable content: full-text `text` plus an optional precomputed `embedding`. */
export interface SearchBlock {
  blockId: string;
  /** Full-text content (e.g. section summary + raw section text). */
  text: string;
  /** Precomputed section embedding (from the Embedder stage); vector-skipped if absent. */
  embedding?: Float32Array;
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

/**
 * Project-level hybrid (full-text + vector) search over a project's indexable
 * blocks. Wiki-free by contract: it references no wiki types — content (and its
 * precomputed embeddings) is supplied through an injected `SearchBlocksProvider`,
 * so it can be lifted to a standalone `resources-search` package unchanged.
 *
 * The index is persisted under `<project>/<systemFolder>/index/search/` and
 * updated incrementally during indexing (throttled serialization). On search it
 * is loaded into memory and used as-is — no rebuild, no query-time corpus
 * embedding. The model + dimensionality are recorded in `index/search.json`.
 */
export class SearchAdapter extends ResourceAdapter {
  private indexer?: Indexer;
  /** Memoised index init: shared by concurrent callers so the open runs exactly once. */
  private indexReady?: Promise<Index>;
  /** Whether the in-memory index has unsaved changes (drives throttled persistence). */
  private dirty = false;
  /** Timestamp (ms) of the last persistence flush. */
  private lastSaveAt = 0;

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
  private indexDir(): string {
    return concatPath(this.projectPath, this.systemFolder, "index");
  }
  private configPath(): string {
    return concatPath(this.indexDir(), "search.json");
  }

  /**
   * Open the project's persisted index (FTS + vector) into memory — loaded from
   * `index/search/` when present, or created fresh on first use. Records the model
   * + dimensionality in `index/search.json`.
   */
  private ensureIndex(): Promise<Index> {
    // Memoise the in-flight promise so concurrent callers (e.g. parallel per-subject
    // searches) share ONE open — otherwise they race on creating + persisting the index.
    this.indexReady ??= this.openIndex();
    return this.indexReady;
  }

  private async openIndex(): Promise<Index> {
    const persistence = new FilesIndexerPersistence(
      this.filesApi,
      concatPath(this.indexDir(), "search"),
    );
    this.indexer = createFlexSearchIndexer({ persistence });
    const existing = await this.indexer.getIndex(INDEX_NAME);
    if (existing) return existing;
    const created = await this.indexer.createIndex({
      name: INDEX_NAME,
      subIndexes: {
        [FTS_SUB]: { type: "fulltext", language: "en" },
        [VEC_SUB]: {
          type: "vector",
          dimensionality: this.opts.dimensionality,
          model: this.opts.model,
        },
      },
    });
    // Record model + dimensionality only when the index is first created (the indexing
    // path) — a read-only query that loads an existing index must not write.
    await writeJsonAtomic(this.filesApi, this.configPath(), {
      model: this.opts.model,
      dimensionality: this.opts.dimensionality,
    });
    return created;
  }

  /** Serialize the index to disk, throttled to at most once per `SAVE_THROTTLE_MS`. */
  private async maybePersist(): Promise<void> {
    if (!this.dirty || !this.indexer) return;
    if (Date.now() - this.lastSaveAt < SAVE_THROTTLE_MS) return;
    await this.indexer.flush();
    this.dirty = false;
    this.lastSaveAt = Date.now();
  }

  /** Force-serialize any pending index changes — call when an indexing pass completes. */
  async persist(): Promise<void> {
    if (!this.dirty || !this.indexer) return;
    await this.indexer.flush();
    this.dirty = false;
    this.lastSaveAt = Date.now();
  }

  /**
   * Re-index one source resource: replace its prior blocks with the current ones.
   * Vectors are precomputed by the Embedder stage (read via the block provider);
   * the FTS content is the section summary + raw text. Persists (throttled).
   */
  async indexPage(resource: Resource, uri: string): Promise<void> {
    const index = await this.ensureIndex();
    const fullTextIndex = ftsAccess.get(index);
    const vectorIndex = vecAccess.get(index);

    const path = toDocumentPath(uri);
    await fullTextIndex.deleteDocuments([{ path }]);
    await vectorIndex.deleteDocuments([{ path }]);

    const blocks = await this.opts.blocks(resource, uri);
    if (blocks.length > 0) {
      const ftsBlocks: FullTextBlock[] = blocks.map((b) => ({
        path,
        blockId: b.blockId,
        content: b.text,
      }));
      await fullTextIndex.addDocument(ftsBlocks);

      const vecBlocks: VectorBlock[] = blocks
        .filter((b) => b.embedding)
        .map((b) => ({ path, blockId: b.blockId, embedding: b.embedding as Float32Array }));
      if (vecBlocks.length > 0) await vectorIndex.addDocument(vecBlocks);

      await fullTextIndex.flush();
      await vectorIndex.flush();
    }
    this.dirty = true;
    await this.maybePersist();
  }

  /** Remove a source's blocks from the index. Persists (throttled). */
  async removePage(uri: string): Promise<void> {
    const index = await this.ensureIndex();
    const path = toDocumentPath(uri);
    await ftsAccess.get(index).deleteDocuments([{ path }]);
    await vecAccess.get(index).deleteDocuments([{ path }]);
    this.dirty = true;
    await this.maybePersist();
  }

  /** Hybrid (RRF) search, grouped by document. */
  async search(query: SearchQuery): Promise<DocumentMatch[]> {
    const index = await this.ensureIndex();
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
        try {
          const resource = await project.getProjectResource(u.uri);
          if (resource) {
            log.debug("indexing page", { uri: u.uri });
            await search.indexPage(resource, u.uri);
          }
        } catch (error) {
          log.error("indexing failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      for await (const u of builder.readUpdates({
        signal: SOURCES_REMOVED_SIGNAL,
        cell: "SearchIndexer",
      })) {
        try {
          log.debug("removing page", { uri: u.uri });
          await search.removePage(u.uri);
        } catch (error) {
          log.error("removal failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      // Drained: force the final serialization the throttle may have skipped.
      await search.persist();
      return true;
    },
  };
}
