import { ProjectBuilder, type RegisteredBuilder } from "@statewalker/resources-workspace";
import { CONTENT_SIGNAL } from "../content/index.js";
import { type LlmCaller, type LlmModels, resolveModel } from "../llm/index.js";
import { ResourceTextContentCache, WikiPageSummary } from "./page-adapters.js";
import { fillCorpusPurpose, SUMMARIZER_SYSTEM_PROMPT } from "./prompts.js";
import { documentSummarySchema, summarizerInputSchema } from "./schemas.js";
import type { DocumentSummary } from "./types.js";

/** Signal emitted for each page whose L2 summary (Sections) is available/changed. */
export const SUMMARIZED_SIGNAL = "summarized";

/** Cell id of the summarizer builder. */
export const SUMMARIZE_BUILDER_ID = "Summarizer";

export interface KnowledgeBuilderDeps {
  models: LlmModels;
  llm: LlmCaller;
  /** Steers the summariser's level of detail per section. */
  corpusPurpose?: string;
  abortSignal?: AbortSignal;
  /** Re-run every stage even when the source hash is unchanged. */
  force?: boolean;
}

function numberedLines(text: string): Array<[number, string]> {
  return text.split("\n").map((line, index) => [index, line]);
}

/**
 * The summarizer builder: consumes `content`, runs the L2 summarization LLM call
 * per page, writes the `DocumentSummary` via `WikiPageSummary`, and emits
 * `summarized`. Lifts wiki-runtime's summarizer cell onto the adapter model.
 */
export function summarizeBuilder(deps: KnowledgeBuilderDeps): RegisteredBuilder {
  const system = fillCorpusPurpose(SUMMARIZER_SYSTEM_PROMPT, deps.corpusPurpose);
  return {
    id: SUMMARIZE_BUILDER_ID,
    inputs: [CONTENT_SIGNAL],
    outputs: [SUMMARIZED_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      for await (const u of builder.readUpdates({
        signal: CONTENT_SIGNAL,
        cell: SUMMARIZE_BUILDER_ID,
      })) {
        const resource = await project.getProjectResource(u.uri);
        if (resource) {
          // Materialise raw.txt + raw.meta.json and learn the current source hash.
          const { text, hash } = await resource
            .requireAdapter(ResourceTextContentCache)
            .refresh({ force: deps.force });
          const existing = await resource.requireAdapter(WikiPageSummary).get();
          // Skip the (costly) summarization LLM call when the source is unchanged.
          if (text && (deps.force || existing?.sourceHash !== hash)) {
            const { output } = await deps.llm.generate({
              name: "summarize-document",
              description:
                "Produce the L2 narrative summary of a single source — title, document summary, and 1–15 section entries each with a kebab-case key and a 0-indexed [startLine, endLine] range.",
              model: resolveModel(deps.models, "summarize"),
              system,
              input: { uri: u.uri, rawLines: numberedLines(text) },
              inputSchema: summarizerInputSchema,
              outputSchema: documentSummarySchema,
              abortSignal: deps.abortSignal,
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
            yield { signal: SUMMARIZED_SIGNAL, uri: u.uri, stamp: u.stamp };
          }
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      return true;
    },
  };
}
