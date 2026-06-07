import { ProjectBuilder, type RegisteredBuilder } from "@statewalker/resources-workspace";
import { resolveModel } from "../llm/index.js";
import { WikiPageGraph, WikiPageSummary } from "./page-adapters.js";
import { fillCorpusPurpose, GRAPH_EXTRACTOR_SYSTEM_PROMPT } from "./prompts.js";
import { documentGraphSchema, graphExtractorInputSchema } from "./schemas.js";
import type { KnowledgeBuilderDeps } from "./summarizer.js";
import { SUMMARIZED_SIGNAL } from "./summarizer.js";
import type { DocumentGraph, SectionGraph } from "./types.js";

/** Signal emitted for each page whose graph is available/changed. */
export const GRAPH_SIGNAL = "graph";
export const GRAPH_BUILDER_ID = "graph";

/**
 * Deterministic post-extraction validation: drop any triple whose subject is not
 * declared as an entity.value somewhere in the document graph. Entity coverage is
 * checked against the WHOLE document, so a triple may reuse a subject from an
 * earlier section. Predicate and object are not validated.
 */
export function filterUnknownSubjects(sections: SectionGraph[]): SectionGraph[] {
  const knownSubjects = new Set<string>();
  for (const s of sections) {
    for (const e of s.entities) knownSubjects.add(e.value);
  }
  const keep = (t: readonly string[]): boolean =>
    typeof t[0] === "string" && knownSubjects.has(t[0]);
  return sections.map((s) => ({
    ...s,
    statements: s.statements.filter(keep),
    relations: s.relations.filter(keep),
  }));
}

/**
 * The graph builder: consumes `summarized`, extracts per-section entities /
 * statements / relations, drops triples with unknown subjects, writes
 * `DocumentGraph` via `WikiPageGraph`, and emits `graph`. Lifts wiki-runtime's
 * GraphExtractor (without the LLM validation-retry loop).
 */
export function graphBuilder(deps: KnowledgeBuilderDeps): RegisteredBuilder {
  const system = fillCorpusPurpose(GRAPH_EXTRACTOR_SYSTEM_PROMPT, deps.corpusPurpose);
  return {
    id: GRAPH_BUILDER_ID,
    inputs: [SUMMARIZED_SIGNAL],
    outputs: [GRAPH_SIGNAL],
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      for await (const u of builder.readUpdates({
        signal: SUMMARIZED_SIGNAL,
        cell: GRAPH_BUILDER_ID,
      })) {
        const resource = await project.getProjectResource(u.uri);
        await u.handled();
        if (!resource) continue;
        const summary = await resource.requireAdapter(WikiPageSummary).get();
        if (!summary) continue;

        const { output } = await deps.llm.generate({
          name: "extract-document-graph",
          description:
            "Per-section structured signal: entities plus [subject, predicate, object] statements (object is a literal) and relations (object is an entity). Subject is always an entity.value.",
          model: resolveModel(deps.models, "graph"),
          system,
          input: { uri: u.uri, sections: summary.sections },
          inputSchema: graphExtractorInputSchema,
          outputSchema: documentGraphSchema,
          abortSignal: deps.abortSignal,
        });

        const graph: DocumentGraph = {
          uri: u.uri,
          generated: new Date().toISOString(),
          sections: filterUnknownSubjects(output.sections),
        };
        await resource.requireAdapter(WikiPageGraph).write(graph);
        yield { signal: GRAPH_SIGNAL, uri: u.uri, stamp: u.stamp };
      }
      return true;
    },
  };
}
