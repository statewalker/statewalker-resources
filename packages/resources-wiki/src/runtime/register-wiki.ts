import type { ExtractorRegistry } from "@statewalker/content-extractors";
import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ProjectBuilder,
  type RegisteredBuilder,
  type Resource,
  ResourceRepository,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { contentBuilder, registerContentExtraction } from "../content/index.js";
import { graphBuilder } from "../knowledge/graph.js";
import {
  EMBEDDED_SIGNAL,
  embedderBuilder,
  metaBuilder,
  pruneBuilder,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
} from "../knowledge/index.js";
import {
  ResourceTextContentCache,
  WikiPageEmbeddings,
  WikiPageSummary,
} from "../knowledge/page-adapters.js";
import {
  type LlmApi,
  LlmProjectAdapter,
  type LlmProvider,
  type StageModelNames,
  WikiLlmConfiguration,
} from "../llm/index.js";
import { registerQuery } from "../query/index.js";
import { registerSnapshots } from "../query/snapshots.js";
import {
  registerSearch,
  type SearchBlock,
  type SearchBlocksProvider,
  searchBuilder,
} from "../search/index.js";

export interface WikiDeps {
  /** Provider for the generic `LlmProjectAdapter` (production). Omit when `llm` is given. */
  provider?: LlmProvider;
  /** Pre-built LLM adapter (test stub). Takes precedence over `provider`. */
  llm?: LlmApi;
  /** Stage → model-name map for `WikiLlmConfiguration`. */
  models: StageModelNames;
  /** Embedding model name (part of the per-doc embeddings filename + index config). */
  embedModel: string;
  /** Embedding dimensionality. */
  dimensionality: number;
  corpusPurpose?: string;
  extractors?: ExtractorRegistry;
  clock?: () => string;
}

/** Per-run build options (distinct from the stable model configuration). */
export interface WikiBuildOptions {
  /** Re-run every build stage even when the source hash is unchanged. */
  force?: boolean;
}

/**
 * Wiki search blocks for the given embedding model/dimensionality: full-text over
 * each section's summary + raw text, with the section's precomputed embedding (read
 * from the Embedder's Arrow sidecar `embeddings.<model>.<dim>.arrow`) as the vector.
 */
export function wikiSearchBlocks(model: string, dimensionality: number): SearchBlocksProvider {
  return async (resource: Resource) => {
    const summary = await resource.getAdapter(WikiPageSummary)?.get();
    if (!summary) return [];
    const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
    const lines = raw.split("\n");
    const vectors = await resource
      .getAdapter(WikiPageEmbeddings)
      ?.getVectors(model, dimensionality);
    return summary.sections.map((s): SearchBlock => {
      const rawBlock = lines.slice(s.startLine, s.endLine + 1).join("\n");
      return {
        blockId: s.key,
        text: `${s.summary}\n${rawBlock}`,
        embedding: vectors?.get(s.key),
      };
    });
  };
}

/** Build the generic LLM adapter from deps: a supplied stub, else a provider-backed one. */
function resolveLlm(deps: WikiDeps): LlmApi {
  if (deps.llm) return deps.llm;
  if (!deps.provider) throw new Error("registerWiki: either `provider` or `llm` is required");
  return new LlmProjectAdapter({ provider: deps.provider });
}

/**
 * One-call setup: register the core resource adapters plus the full wiki adapter pack
 * (the generic `LlmProjectAdapter` + wiki-specific `WikiLlmConfiguration`, content
 * extraction, per-page + global knowledge adapters, hybrid search, query, snapshots)
 * on a `ResourceRepository`. Providers/config are injected here — adapters read no
 * environment. Use `wireWikiProject` to attach the builders to a project before a run.
 */
export function registerWiki(repository: ResourceRepository, deps: WikiDeps): void {
  const llm = resolveLlm(deps);
  // Core resource model.
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  // Model access (generic) + model configuration (wiki-specific), as project adapters.
  repository.register("", LlmProjectAdapter, () => llm);
  repository.register(
    "",
    WikiLlmConfiguration,
    () =>
      new WikiLlmConfiguration({
        models: deps.models,
        embedModel: deps.embedModel,
        dimensionality: deps.dimensionality,
        corpusPurpose: deps.corpusPurpose,
      }),
  );
  // Wiki adapters.
  registerContentExtraction(repository, { registry: deps.extractors });
  registerKnowledgeAdapters(repository);
  registerSearch(repository, {
    // Search embeds the query through the same LLM adapter the pipeline uses.
    embed: (text) => llm.embed(text, deps.embedModel),
    model: deps.embedModel,
    dimensionality: deps.dimensionality,
    blocks: wikiSearchBlocks(deps.embedModel, deps.dimensionality),
  });
  registerQuery(repository);
  registerSnapshots(repository, { clock: deps.clock });
}

/** The wiki's builder pipeline, in registration order. Builders read their models
 * from the project adapters; only the per-run `force` flag is threaded here. */
export function createWikiBuilders(opts: WikiBuildOptions = {}): RegisteredBuilder[] {
  const { force } = opts;
  return [
    contentBuilder(),
    summarizeBuilder({ force }),
    metaBuilder({ force }),
    graphBuilder({ force }),
    embedderBuilder({ force }),
    reorganizeBuilder(),
    pruneBuilder(),
    searchBuilder({ inputSignal: EMBEDDED_SIGNAL }),
  ];
}

/** Attach the wiki builders to a project's `ProjectBuilder` and return it. */
export function wireWikiProject(project: Project, opts: WikiBuildOptions = {}): ProjectBuilder {
  const builder = project.requireAdapter(ProjectBuilder);
  for (const b of createWikiBuilders(opts)) builder.registerBuilder(b);
  return builder;
}
