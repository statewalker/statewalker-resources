import {
  type BuilderUpdate,
  type EmittedUpdate,
  loggerOf,
  ProjectBuilder,
  type RegisteredBuilder,
} from "@statewalker/resources-workspace";
import { CONTENT_SIGNAL } from "../content/index.js";
import { llmOf, wikiConfigOf } from "../llm/index.js";
import { toBatch } from "../util/batch.js";
import { ResourceTextContentCache, WikiPageSummary } from "./page-adapters.js";
import { fillCorpusPurpose, SUMMARIZER_SYSTEM_PROMPT } from "./prompts.js";
import { documentSummarySchema, summarizerInputSchema } from "./schemas.js";
import type { DocumentSummary } from "./types.js";

/** Signal emitted for each page whose L2 summary (Sections) is available/changed. */
export const SUMMARIZED_SIGNAL = "summarized";

/** Cell id of the summarizer builder. */
export const SUMMARIZE_BUILDER_ID = "Summarizer";

/** Documents summarized in parallel per batch. */
const SUMMARIZE_BATCH_SIZE = 8;

function numberedLines(text: string): Array<[number, string]> {
  return text.split("\n").map((line, index) => [index, line]);
}

/**
 * The summarizer builder: consumes `content`, runs the L2 summarization LLM call
 * per page, writes the `DocumentSummary` via `WikiPageSummary`, and emits
 * `summarized`. Lifts wiki-runtime's summarizer cell onto the adapter model.
 */
export function summarizeBuilder(opts: { force?: boolean } = {}): RegisteredBuilder {
  return {
    id: SUMMARIZE_BUILDER_ID,
    inputs: [CONTENT_SIGNAL],
    outputs: [SUMMARIZED_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const log = loggerOf(project, SUMMARIZE_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const system = fillCorpusPurpose(SUMMARIZER_SYSTEM_PROMPT, cfg.corpusPurpose);
      const source = builder.readUpdates({
        signal: CONTENT_SIGNAL,
        cell: SUMMARIZE_BUILDER_ID,
      });
      for await (const batch of toBatch(source, SUMMARIZE_BATCH_SIZE)) {
        for (const emitted of await Promise.all(batch.map(handleEntry))) yield* emitted;
        if (!(await builder.yieldControl())) return false;
      }
      return true;

      async function handleEntry(u: BuilderUpdate): Promise<EmittedUpdate[]> {
        const out: EmittedUpdate[] = [];
        try {
          const resource = await project.getProjectResource(u.uri);
          if (resource) {
            // Materialise raw.txt + raw.meta.json and learn the current source hash.
            const { text, hash } = await resource
              .requireAdapter(ResourceTextContentCache)
              .refresh({ force: opts.force });
            const existing = await resource.requireAdapter(WikiPageSummary).get();
            const fresh = !!existing && existing.sourceHash === hash;
            let produced = false;
            // Skip the (costly) summarization LLM call when the source is unchanged.
            if (text && (opts.force || !fresh)) {
              log.info("summarizing", { uri: u.uri });
              const { output } = await llm.generateObject({
                name: "summarize-document",
                description:
                  "Produce the L2 narrative summary of a single source — title, document summary, and 1–15 section entries each with a kebab-case key and a 0-indexed [startLine, endLine] range.",
                model: cfg.modelFor("summarize"),
                system,
                input: { uri: u.uri, rawLines: numberedLines(text) },
                inputSchema: summarizerInputSchema,
                outputSchema: documentSummarySchema,
              });

              const summary: DocumentSummary = {
                uri: u.uri,
                generated: new Date().toISOString(),
                sourceHash: hash,
                title: output.title,
                summary: output.summary,
                sections: output.sections,
              };
              await resource.requireAdapter(WikiPageSummary).write(summary);
              produced = true;
            }
            // Emit on a hash-skip too (when a valid summary already exists), so a
            // re-run — e.g. after invalidating this stage — re-feeds downstream
            // (meta/graph/embedder) without re-summarizing.
            if (produced || fresh) {
              out.push({ signal: SUMMARIZED_SIGNAL, uri: u.uri, stamp: u.stamp });
            }
          }
        } catch (error) {
          // Isolate a bad document (e.g. unparseable PDF): log and skip it rather
          // than blocking the whole pipeline. `handled()` below marks it done so it
          // is not retried until its source changes.
          log.error("summarize failed; skipping document", {
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
