// @statewalker/resources-wiki — public barrel.
//
// Wiki capabilities for the statewalker resources framework, layered on
// `@statewalker/resources-workspace`: signal-driven builders plus Project/Resource
// adapters that turn a project's sources into a queryable, layered, LLM-curated wiki.
//
// Surface is populated phase-by-phase (see openspec/changes/resources-wiki):
//   wiki-uri · content-extraction · wiki-knowledge · wiki-search · wiki-answers · registerWiki.

export * from "./content/index.js";
export * from "./knowledge/index.js";
export type { LlmCaller, LlmCallSpec, LlmCallUsage, LlmModels } from "./llm/index.js";
export { resolveModel, vercelLlmCaller } from "./llm/index.js";
export * from "./query/index.js";
export * from "./search/index.js";
export * from "./uri/index.js";
