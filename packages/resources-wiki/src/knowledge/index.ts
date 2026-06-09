import type { ResourceRepository } from "@statewalker/resources-workspace";
import { WikiOutlierIndex, WikiTopicIndex } from "./indexes.js";
import {
  ResourceTextContentCache,
  WikiPageEmbeddings,
  WikiPageGraph,
  WikiPageMeta,
  WikiPageSummary,
} from "./page-adapters.js";

export { EMBED_BUILDER_ID, EMBEDDED_SIGNAL, embedderBuilder } from "./embedder.js";
export { filterUnknownSubjects, GRAPH_BUILDER_ID, GRAPH_SIGNAL, graphBuilder } from "./graph.js";
export {
  collectExistingClasses,
  WikiOutlierIndex,
  WikiTopicIndex,
} from "./indexes.js";
export {
  META_BUILDER_ID,
  META_REMOVED_TOPICS_SIGNAL,
  META_SIGNAL,
  metaBuilder,
} from "./meta.js";
export {
  ResourceTextContentCache,
  WikiPageEmbeddings,
  WikiPageGraph,
  WikiPageMeta,
  WikiPageSummary,
} from "./page-adapters.js";
export { pageArtifactPath, pageDirPath, projectIndexPath, resourceUri } from "./page-paths.js";
export {
  fillCorpusPurpose,
  GRAPH_EXTRACTOR_SYSTEM_PROMPT,
  META_EXTRACTOR_SYSTEM_PROMPT,
  REORGANIZER_SYSTEM_PROMPT,
  SUMMARIZER_SYSTEM_PROMPT,
} from "./prompts.js";
export {
  PRUNE_BUILDER_ID,
  pruneBuilder,
  REORGANIZE_BUILDER_ID,
  reorganizeBuilder,
} from "./reorganize.js";
export {
  type DocumentGraphOutput,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  documentGraphSchema,
  documentMetaSchema,
  documentSummarySchema,
  type ReorganizeAction,
  type ReorganizeActions,
  type ReorganizerInput,
  reorganizeActionsSchema,
  reorganizerInputSchema,
  type SummarizerInput,
  sectionSummarySchema,
  summarizerInputSchema,
} from "./schemas.js";
export {
  SUMMARIZE_BUILDER_ID,
  SUMMARIZED_SIGNAL,
  summarizeBuilder,
} from "./summarizer.js";
export type {
  DocumentEmbeddings,
  DocumentGraph,
  DocumentMeta,
  DocumentOutlier,
  DocumentSummary,
  DocumentTopic,
  Entity,
  GlobalOutlier,
  GlobalTopic,
  OutlierIndex,
  Relation,
  SectionGraph,
  SectionSummary,
  Statement,
  TopicIndex,
  Triple,
} from "./types.js";

/** Register the per-page and project-level knowledge adapters on a repository. */
export function registerKnowledgeAdapters(repository: ResourceRepository): () => void {
  const unregisters = [
    repository.register("", ResourceTextContentCache),
    repository.register("", WikiPageSummary),
    repository.register("", WikiPageMeta),
    repository.register("", WikiPageGraph),
    repository.register("", WikiPageEmbeddings),
    repository.register("", WikiTopicIndex),
    repository.register("", WikiOutlierIndex),
  ];
  return () => {
    for (const u of unregisters) u();
  };
}
