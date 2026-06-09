import type { ExtractorRegistry } from "@statewalker/content-extractors";
import type { EmbedFn } from "@statewalker/indexer-api";
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
  metaBuilder,
  pruneBuilder,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  SUMMARIZED_SIGNAL,
  summarizeBuilder,
} from "../knowledge/index.js";
import { ResourceTextContentCache, WikiPageSummary } from "../knowledge/page-adapters.js";
import { type LlmCaller, type LlmModels, vercelLlmCaller } from "../llm/index.js";
import { registerQuery } from "../query/index.js";
import { registerSnapshots } from "../query/snapshots.js";
import {
  registerSearch,
  type SearchBlock,
  type SearchBlocksProvider,
  searchBuilder,
} from "../search/index.js";

export interface WikiDeps {
  models: LlmModels;
  /** LLM caller. Defaults to the Vercel AI SDK caller. */
  llm?: LlmCaller;
  /** Embedding function for the vector search sub-index. */
  embed: EmbedFn;
  /** Embedding model id (recorded in the search index config). */
  embedModel: string;
  /** Embedding dimensionality. */
  dimensionality: number;
  corpusPurpose?: string;
  extractors?: ExtractorRegistry;
  clock?: () => string;
  /** Re-run every build stage even when the source hash is unchanged. */
  force?: boolean;
}

/** Wiki search blocks: FTS over each section's raw text, vector over its summary. */
export const wikiSearchBlocks: SearchBlocksProvider = async (resource: Resource) => {
  const summary = await resource.getAdapter(WikiPageSummary)?.get();
  if (!summary) return [];
  const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
  const lines = raw.split("\n");
  const blocks: SearchBlock[] = summary.sections.map((s) => ({
    blockId: s.key,
    text: lines.slice(s.startLine, s.endLine + 1).join("\n"),
    vectorText: s.summary,
  }));
  return blocks;
};

/**
 * One-call setup: register the core resource adapters plus the full wiki adapter pack
 * (content extraction, per-page + global knowledge adapters, hybrid search, query,
 * snapshots) on a `ResourceRepository`. Providers are injected here — adapters read no
 * environment. Use `wireWikiProject` to attach the builders to a project before a run.
 */
export function registerWiki(repository: ResourceRepository, deps: WikiDeps): void {
  const llm = deps.llm ?? vercelLlmCaller();
  // Core resource model.
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  // Wiki adapters.
  registerContentExtraction(repository, { registry: deps.extractors });
  registerKnowledgeAdapters(repository);
  registerSearch(repository, {
    embed: deps.embed,
    model: deps.embedModel,
    dimensionality: deps.dimensionality,
    blocks: wikiSearchBlocks,
  });
  registerQuery(repository, { models: deps.models, llm, corpusPurpose: deps.corpusPurpose });
  registerSnapshots(repository, { clock: deps.clock });
}

/** The wiki's builder pipeline, in registration order. */
export function createWikiBuilders(deps: WikiDeps): RegisteredBuilder[] {
  const llm = deps.llm ?? vercelLlmCaller();
  const knowledge = {
    models: deps.models,
    llm,
    corpusPurpose: deps.corpusPurpose,
    force: deps.force,
  };
  return [
    contentBuilder(),
    summarizeBuilder(knowledge),
    metaBuilder(knowledge),
    graphBuilder(knowledge),
    reorganizeBuilder(knowledge),
    pruneBuilder(),
    searchBuilder({ inputSignal: SUMMARIZED_SIGNAL }),
  ];
}

/** Attach the wiki builders to a project's `ProjectBuilder` and return it. */
export function wireWikiProject(project: Project, deps: WikiDeps): ProjectBuilder {
  const builder = project.requireAdapter(ProjectBuilder);
  for (const b of createWikiBuilders(deps)) builder.registerBuilder(b);
  return builder;
}
