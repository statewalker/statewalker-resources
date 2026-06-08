import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbedFn } from "@statewalker/indexer-api";
import { embed as aiEmbed } from "ai";
import type { LlmModels } from "../llm/index.js";

export interface ResolvedProviders {
  models: LlmModels;
  embed: EmbedFn;
  embedModel: string;
  dimensionality: number;
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`missing required env var ${key}`);
  return value;
}

/**
 * Resolve LLM models + embedding function from environment variables — the
 * composition-root boundary (adapters read no env). Selects a provider via
 * `WIKI_PROVIDER` (`openai` | `google`, default `openai`); model/embedding ids and
 * dimensionality are overridable via `WIKI_MODEL` / `WIKI_EMBED_MODEL` / `WIKI_EMBED_DIM`.
 */
export function resolveProvidersFromEnv(
  env: Record<string, string | undefined>,
): ResolvedProviders {
  const providerId = env.WIKI_PROVIDER ?? "openai";
  if (providerId === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: required(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
    });
    const embedModel = env.WIKI_EMBED_MODEL ?? "text-embedding-004";
    const model = google.embeddingModel(embedModel);
    return {
      models: { default: google(env.WIKI_MODEL ?? "gemini-2.5-flash") },
      embed: async (text) => new Float32Array((await aiEmbed({ model, value: text })).embedding),
      embedModel,
      dimensionality: Number(env.WIKI_EMBED_DIM ?? "768"),
    };
  }
  const openai = createOpenAI({ apiKey: required(env, "OPENAI_API_KEY") });
  const embedModel = env.WIKI_EMBED_MODEL ?? "text-embedding-3-small";
  const model = openai.embeddingModel(embedModel);
  return {
    models: { default: openai(env.WIKI_MODEL ?? "gpt-4.1-mini") },
    embed: async (text) => new Float32Array((await aiEmbed({ model, value: text })).embedding),
    embedModel,
    dimensionality: Number(env.WIKI_EMBED_DIM ?? "1536"),
  };
}
