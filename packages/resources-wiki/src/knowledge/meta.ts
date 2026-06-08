import { ProjectBuilder, type RegisteredBuilder } from "@statewalker/resources-workspace";
import { resolveModel } from "../llm/index.js";
import { collectExistingClasses } from "./indexes.js";
import { ResourceTextContentCache, WikiPageMeta, WikiPageSummary } from "./page-adapters.js";
import { fillCorpusPurpose, META_EXTRACTOR_SYSTEM_PROMPT } from "./prompts.js";
import { documentMetaSchema, metaExtractorInputSchema } from "./schemas.js";
import type { KnowledgeBuilderDeps } from "./summarizer.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import type { DocumentMeta } from "./types.js";

/** Signal emitted for each page whose topic/outlier declarations are available/changed. */
export const META_SIGNAL = "meta";
/** Tombstone signal: a `<uri>#<topicKey>` declaration was removed (drives the pruner). */
export const META_REMOVED_TOPICS_SIGNAL = "meta-removed-topics";
export const META_BUILDER_ID = "MetaExtractor";

/**
 * The meta builder: consumes `summarized`, extracts per-document topic/outlier
 * declarations (encouraging reuse of already-coined classes), writes `DocumentMeta`
 * via `WikiPageMeta`, emits `meta`, and emits `meta:removed-topics` tombstones for
 * topics that were present before but are gone now. Lifts wiki-runtime's MetaExtractor.
 */
export function metaBuilder(deps: KnowledgeBuilderDeps): RegisteredBuilder {
  const system = fillCorpusPurpose(META_EXTRACTOR_SYSTEM_PROMPT, deps.corpusPurpose);
  return {
    id: META_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [META_SIGNAL, META_REMOVED_TOPICS_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const existingClasses = await collectExistingClasses(project);
      for await (const u of builder.readUpdates({
        signal: SUMMARIZED_SIGNAL,
        cell: META_BUILDER_ID,
      })) {
        const resource = await project.getProjectResource(u.uri);
        const summary = await resource?.requireAdapter(WikiPageSummary).get();
        const hash = await resource?.requireAdapter(ResourceTextContentCache).getRawMeta();
        const prior = await resource?.requireAdapter(WikiPageMeta).get();
        const fresh = !!prior && !!hash && prior.sourceHash === hash.hash;
        if (resource && summary && (deps.force || !fresh)) {
          const { output } = await deps.llm.generate({
            name: "extract-document-meta",
            description:
              "Declare the topic and outlier classes covered by this document. Reuse existing class keys; copy their description verbatim. Mark outliers only when the source itself flags surprise.",
            model: resolveModel(deps.models, "meta"),
            system,
            input: { uri: u.uri, summary, existingClasses },
            inputSchema: metaExtractorInputSchema,
            outputSchema: documentMetaSchema,
            abortSignal: deps.abortSignal,
          });

          const meta: DocumentMeta = {
            uri: u.uri,
            generated: new Date().toISOString(),
            sourceHash: hash?.hash ?? "",
            topics: output.topics,
            outliers: output.outliers,
          };
          await resource.requireAdapter(WikiPageMeta).write(meta);
          yield { signal: META_SIGNAL, uri: u.uri, stamp: u.stamp };

          if (prior) {
            const newKeys = new Set(meta.topics.map((t) => t.key));
            for (const t of prior.topics) {
              if (!newKeys.has(t.key)) {
                yield {
                  signal: META_REMOVED_TOPICS_SIGNAL,
                  uri: `${u.uri}#${t.key}`,
                  stamp: u.stamp,
                };
              }
            }
          }
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      return true;
    },
  };
}
