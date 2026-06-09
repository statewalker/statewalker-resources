import type { ResourceRepository } from "@statewalker/resources-workspace";
import {
  type LlmApi,
  LlmProjectAdapter,
  type StageModelNames,
  WikiLlmConfiguration,
} from "../../src/index.js";

export interface StubLlmOptions {
  /** Stands in for structured generation — usually a `switch (spec.name)`. */
  generateObject: LlmApi["generateObject"];
  /** Single-text embedder fixture (also drives `embedBatch`). */
  embed?: (text: string) => Promise<Float32Array>;
  models?: StageModelNames;
  embedModel?: string;
  dimensionality?: number;
  corpusPurpose?: string;
}

/** Build a stub `LlmApi` from a `generateObject` fn + an optional embed fixture. */
export function makeStubLlm(opts: {
  generateObject: LlmApi["generateObject"];
  embed?: (text: string) => Promise<Float32Array>;
}): LlmApi {
  const embed = opts.embed ?? (async () => new Float32Array());
  return {
    generateObject: opts.generateObject,
    generateText: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    streamText: async function* () {
      // stub stream emits nothing
    },
    embed: async (text) => embed(text),
    embedBatch: async (texts) => Promise.all(texts.map((t) => embed(t))),
  };
}

/**
 * Register the two model project adapters with stubs — the `LlmProjectAdapter`
 * (generic generation/embedding) and `WikiLlmConfiguration` (stage→model names) —
 * for tests that wire adapters manually instead of through `registerWiki`.
 */
export function registerStubLlm(repository: ResourceRepository, opts: StubLlmOptions): LlmApi {
  const llm = makeStubLlm(opts);
  repository.register("", LlmProjectAdapter, () => llm);
  repository.register(
    "",
    WikiLlmConfiguration,
    () =>
      new WikiLlmConfiguration({
        models: opts.models ?? { default: "stub-model" },
        embedModel: opts.embedModel ?? "fixture",
        dimensionality: opts.dimensionality ?? 2,
        corpusPurpose: opts.corpusPurpose,
      }),
  );
  return llm;
}
