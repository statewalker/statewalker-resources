import type { ResourceRepository } from "@statewalker/resources-workspace";
import { ResourceTextContentCache, WikiPageSummary } from "./page-adapters.js";

export {
  ResourceTextContentCache,
  WikiPageSummary,
} from "./page-adapters.js";
export { pageArtifactPath, resourceUri } from "./page-paths.js";
export { fillCorpusPurpose, SUMMARIZER_SYSTEM_PROMPT } from "./prompts.js";
export {
  type DocumentSummaryOutput,
  documentSummarySchema,
  type SummarizerInput,
  sectionSummarySchema,
  summarizerInputSchema,
} from "./schemas.js";
export {
  type KnowledgeBuilderDeps,
  SUMMARIZE_BUILDER_ID,
  SUMMARIZED_SIGNAL,
  summarizeBuilder,
} from "./summarizer.js";
export type { DocumentSummary, SectionSummary } from "./types.js";

/** Register the per-page knowledge adapters on a repository. */
export function registerKnowledgeAdapters(repository: ResourceRepository): () => void {
  const unregisters = [
    repository.register("", ResourceTextContentCache),
    repository.register("", WikiPageSummary),
  ];
  return () => {
    for (const u of unregisters) u();
  };
}
