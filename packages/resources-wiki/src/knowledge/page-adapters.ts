import { ResourceAdapter, type ResourceRepository } from "@statewalker/resources-workspace";
import type { FilesApi } from "@statewalker/webrun-files";
import { ContentAdapter } from "../content/index.js";
import { tryReadJson, tryReadText, writeJsonAtomic, writeTextAtomic } from "../util/io.js";
import { pageArtifactPath } from "./page-paths.js";
import type { DocumentSummary, SectionSummary } from "./types.js";

function filesApiOf(adapter: ResourceAdapter): FilesApi {
  return (adapter.repository as ResourceRepository).filesApi;
}

/**
 * Caches a source resource's extracted raw text under the project system folder,
 * extracting via `ContentAdapter` on first access. The canonical raw-text accessor
 * for downstream builders (summarizer, etc.).
 */
export class ResourceTextContentCache extends ResourceAdapter {
  private artifactPath(): string {
    return pageArtifactPath(this.resource, "raw.txt");
  }

  /** Extracted plain text — from cache, or extracted-and-cached on first call. */
  async getTextContent(): Promise<string> {
    const cached = await tryReadText(filesApiOf(this), this.artifactPath());
    if (cached !== undefined) return cached;
    return this.refreshTextContent();
  }

  /** Re-extract from source and overwrite the cache. Returns the fresh text. */
  async refreshTextContent(): Promise<string> {
    const content = this.resource.getAdapter(ContentAdapter);
    const text = (await content?.readContent()) ?? "";
    await writeTextAtomic(filesApiOf(this), this.artifactPath(), text);
    return text;
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
