import {
  type ContentExtractor,
  createDefaultRegistry,
  type ExtractorRegistry,
} from "@statewalker/content-extractors";
import {
  type Adaptable,
  ProjectBuilder,
  type RegisteredBuilder,
  type Resource,
  ResourceAdapter,
  type ResourceRepository,
  SOURCES_SIGNAL,
} from "@statewalker/resources-workspace";

/** Signal emitted for each resource whose text content is available/changed. */
export const CONTENT_SIGNAL = "content";

/** Cell id of the content-extraction builder. */
export const CONTENT_BUILDER_ID = "Extractor";

export interface ContentExtractionOptions {
  /** Maps a resource path to a text extractor. Defaults to `createDefaultRegistry()`. */
  registry?: ExtractorRegistry;
  /** Extractor for paths the registry doesn't match. */
  fallback?: ContentExtractor;
}

interface AdapterOptions extends Record<string, unknown> {
  registry: ExtractorRegistry;
  fallback?: ContentExtractor;
}

/**
 * Reads a resource's text content via a mime-aware extractor registry. Present
 * (via `getAdapter`) only for resources whose path the registry (or fallback)
 * can extract; otherwise `getAdapter(ContentAdapter)` returns `null`.
 *
 * Wiki-free by contract: this adapter references no wiki types — it operates on a
 * `Resource` and produces text, so it can be lifted to a standalone
 * `resources-content` package unchanged.
 */
export class ContentAdapter extends ResourceAdapter {
  private get opts(): AdapterOptions {
    return this.options as AdapterOptions;
  }

  private get filesApi() {
    return (this.repository as ResourceRepository).filesApi;
  }

  private extractor(): ContentExtractor | undefined {
    return this.opts.registry.get(this.resource.url) ?? this.opts.fallback;
  }

  /** Extracted plain text, or `undefined` if nothing could be extracted. */
  async readContent(): Promise<string | undefined> {
    const extractor = this.extractor();
    if (!extractor) return undefined;
    const result = await extractor(this.filesApi.read(this.resource.path));
    if (result === null || result === undefined) return undefined;
    const text = typeof result === "string" ? result : String(result);
    return text.length === 0 ? undefined : text;
  }
}

/**
 * Register `ContentAdapter` on the repository so it is present only for
 * extractable resources. Returns an unregister function.
 */
export function registerContentExtraction(
  repository: ResourceRepository,
  opts: ContentExtractionOptions = {},
): () => void {
  const registry = opts.registry ?? createDefaultRegistry();
  const fallback = opts.fallback;
  return repository.register("", ContentAdapter, (adaptable: Adaptable) => {
    const resource = adaptable as Resource;
    const extractor = registry.get(resource.url) ?? fallback;
    return extractor ? new ContentAdapter(resource, { registry, fallback }) : null;
  });
}

/**
 * The content-extraction builder: consumes `sources` and emits `content` for each
 * changed extractable resource, skipping resources with no registered extractor.
 */
export function contentBuilder(): RegisteredBuilder {
  return {
    id: CONTENT_BUILDER_ID,
    inputs: [SOURCES_SIGNAL],
    outputs: [CONTENT_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      for await (const u of builder.readUpdates({
        signal: SOURCES_SIGNAL,
        cell: CONTENT_BUILDER_ID,
      })) {
        const resource = await project.getProjectResource(u.uri);
        if (resource?.getAdapter(ContentAdapter)) {
          yield { signal: CONTENT_SIGNAL, uri: u.uri, stamp: u.stamp };
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      return true;
    },
  };
}
