import { ResourceAdapter, type ResourceRepository } from "@statewalker/resources-workspace";
import type { FilesApi } from "@statewalker/webrun-files";
import { ContentAdapter } from "../content/index.js";
import { hashStream } from "../util/hash.js";
import { tryReadJson, tryReadText, writeJsonAtomic, writeTextAtomic } from "../util/io.js";
import { pageArtifactPath } from "./page-paths.js";
import type {
  DocumentGraph,
  DocumentMeta,
  DocumentSummary,
  RawMeta,
  SectionSummary,
} from "./types.js";

function filesApiOf(adapter: ResourceAdapter): FilesApi {
  return (adapter.repository as ResourceRepository).filesApi;
}

/**
 * Caches a source resource's extracted raw text under the project system folder,
 * extracting via `ContentAdapter` on first access. The canonical raw-text accessor
 * for downstream builders (summarizer, etc.).
 */
export class ResourceTextContentCache extends ResourceAdapter {
  private rawPath(): string {
    return pageArtifactPath(this.resource, "raw.txt");
  }
  private metaPath(): string {
    return pageArtifactPath(this.resource, "raw.meta.json");
  }

  /** Metadata about the cached raw text — including the source hash. */
  getRawMeta(): Promise<RawMeta | undefined> {
    return tryReadJson<RawMeta>(filesApiOf(this), this.metaPath());
  }

  /** SHA-256 (hex) of the current source bytes, plus the byte count. */
  private sourceHash(): Promise<{ hash: string; bytes: number }> {
    return hashStream(filesApiOf(this).read(this.resource.path));
  }

  /** Extracted plain text — from cache, or extracted-and-cached on first call. */
  async getTextContent(): Promise<string> {
    const cached = await tryReadText(filesApiOf(this), this.rawPath());
    if (cached !== undefined) return cached;
    return (await this.refresh()).text;
  }

  /**
   * Ensure `raw.txt` + `raw.meta.json` reflect the current source. If the source
   * hash is unchanged (and the cache is present) the extraction is skipped and the
   * cached text returned; otherwise the source is re-extracted and both artifacts
   * rewritten. `force` always re-extracts. `changed` reports whether the source
   * (by hash) differs from the last cached one.
   */
  async refresh(opts: { force?: boolean } = {}): Promise<{
    text: string;
    hash: string;
    changed: boolean;
  }> {
    const files = filesApiOf(this);
    const { hash, bytes } = await this.sourceHash();
    const prev = await this.getRawMeta();
    if (!opts.force && prev?.hash === hash) {
      const cached = await tryReadText(files, this.rawPath());
      if (cached !== undefined) return { text: cached, hash, changed: false };
    }
    const content = this.resource.getAdapter(ContentAdapter);
    const text = (await content?.readContent()) ?? "";
    await writeTextAtomic(files, this.rawPath(), text);
    await writeJsonAtomic(files, this.metaPath(), {
      hash,
      bytes,
      generated: new Date().toISOString(),
    } satisfies RawMeta);
    return { text, hash, changed: prev?.hash !== hash };
  }
}

/** Reads/writes a source resource's L2 `DocumentSummary` (`summary.json`). */
export class WikiPageSummary extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "summary.json");
  }

  async get(): Promise<DocumentSummary | undefined> {
    return tryReadJson<DocumentSummary>(filesApiOf(this), this.artifactPath());
  }

  async *sections(): AsyncIterable<SectionSummary> {
    const summary = await this.get();
    if (summary) yield* summary.sections;
  }

  async write(summary: DocumentSummary): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), summary);
  }
}

/** Reads/writes a source resource's `DocumentMeta` (`meta.json`). */
export class WikiPageMeta extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "meta.json");
  }

  async get(): Promise<DocumentMeta | undefined> {
    return tryReadJson<DocumentMeta>(filesApiOf(this), this.artifactPath());
  }

  async write(meta: DocumentMeta): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), meta);
  }
}

/** Reads/writes a source resource's `DocumentGraph` (`graph.json`). */
export class WikiPageGraph extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "graph.json");
  }

  async get(): Promise<DocumentGraph | undefined> {
    return tryReadJson<DocumentGraph>(filesApiOf(this), this.artifactPath());
  }

  async write(graph: DocumentGraph): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), graph);
  }
}
