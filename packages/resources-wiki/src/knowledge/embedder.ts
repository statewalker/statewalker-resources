import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/resources-workspace";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { ResourceTextContentCache, WikiPageEmbeddings, WikiPageSummary } from "./page-adapters.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import type { DocumentEmbeddings } from "./types.js";

export const EMBED_BUILDER_ID = "Embedder";
export const EMBEDDED_SIGNAL = "embedded";

/** Documents embedded in parallel per batch (each already batches its sections). */
const EMBED_BATCH_SIZE = 8;

/**
 * The embedder builder: consumes `summarized`, batch-embeds each document's section
 * summaries in a single call, and stores the vectors beside the page artifacts as
 * `embeddings.<model>.<dim>.json`. Emits `embedded` for the SearchIndexer to fold
 * into the vector index. Skips documents whose embeddings already match the source
 * hash (and model/dimensionality, via the filename). Reads the embedding model +
 * dimensionality from `WikiLlmConfiguration` and embeds via `LlmProjectAdapter`.
 */
export function embedderBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: EMBED_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [EMBEDDED_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, EMBED_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const model = cfg.embedModel;
      const dimensionality = cfg.dimensionality;
      const source = builder.readUpdates({
        signal: SUMMARIZED_SIGNAL,
        cell: EMBED_BUILDER_ID,
      });
      for await (const batch of toBatch(source, EMBED_BATCH_SIZE)) {
        for (const emitted of await Promise.all(batch.map(handleEntry))) yield* emitted;
        if (!(await builder.yieldControl())) return false;
      }
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<EmittedUpdate[]> {
        const out: EmittedUpdate[] = [];
        try {
          const resource = await project.getProjectResource(u.uri);
          const summary = await resource?.requireAdapter(WikiPageSummary).get();
          const hash = await resource?.requireAdapter(ResourceTextContentCache).getRawMeta();
          const prior = await resource
            ?.requireAdapter(WikiPageEmbeddings)
            .getMeta(model, dimensionality);
          // `Array.isArray(prior.sections)` also rejects the legacy JSON format
          // (vectors inlined as a `Record`), so pre-Arrow embeddings are re-embedded.
          const fresh =
            !!prior && !!hash && prior.sourceHash === hash.hash && Array.isArray(prior.sections);
          if (resource && summary && (opts.force || !fresh)) {
            log.info("embedding sections", { uri: u.uri, sections: summary.sections.length });
            // One batched embedding call per document.
            const vectors = summary.sections.length
              ? await llm.embedBatch(
                  summary.sections.map((s) => s.summary),
                  model,
                )
              : [];
            // Keep keys + vectors aligned, dropping any section that failed to embed.
            const keys: string[] = [];
            const vecs: Float32Array[] = [];
            summary.sections.forEach((s, i) => {
              const v = vectors[i];
              if (v) {
                keys.push(s.key);
                vecs.push(v);
              }
            });
            const meta: DocumentEmbeddings = {
              uri: u.uri,
              generated: new Date().toISOString(),
              sourceHash: hash?.hash ?? "",
              model,
              dimensionality,
              sections: keys,
            };
            await resource.requireAdapter(WikiPageEmbeddings).write(meta, vecs);
            out.push({ signal: EMBEDDED_SIGNAL, uri: u.uri, stamp: u.stamp });
          }
        } catch (error) {
          log.error("embedding failed; skipping document", {
            uri: u.uri,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          await u.handled();
        }
        return out;
      }
    },
  };
}
