import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProvider, StageModelNames } from "../llm/index.js";

export interface ResolvedProviders {
  /** Provider capability for the generic `LlmProjectAdapter`. */
  provider: LlmProvider;
  /** Stage → model-name map for `WikiLlmConfiguration`. */
  models: StageModelNames;
  /** Embedding model name. */
  embedModel: string;
  /** Embedding dimensionality. */
  dimensionality: number;
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`missing required env var ${key}`);
  return value;
}

/**
 * Resolve the LLM provider + model configuration from environment variables — the
 * composition-root boundary (adapters read no env). Selects a provider via
 * `WIKI_PROVIDER` (`openai` | `google`, default `openai`); model/embedding ids and
 * dimensionality are overridable via `WIKI_MODEL` / `WIKI_MODEL_FAST` / `WIKI_MODEL_STRONG`
 * / `WIKI_EMBED_MODEL` / `WIKI_EMBED_DIM`. `WIKI_MODEL_FAST` is the weak model the
 * section-relevance filter (`queryFast`) uses (falls back to `WIKI_MODEL` when unset — a
 * too-small tier under-selects, so opt in deliberately); `WIKI_MODEL_STRONG` is the advanced
 * model the final answer composition (`queryStrong`) uses, defaulting to the provider's top tier.
 * The returned `provider` turns model *names* into runtime models for `LlmProjectAdapter`.
 */
export function resolveProvidersFromEnv(
  env: Record<string, string | undefined>,
): ResolvedProviders {
  const providerId = env.WIKI_PROVIDER ?? "openai";
  if (providerId === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: required(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
    });
    return {
      provider: {
        languageModel: (name) => google(name),
        textEmbeddingModel: (name) => google.embeddingModel(name),
      },
      models: {
        default: env.WIKI_MODEL ?? "gemini-2.5-flash",
        ...(env.WIKI_MODEL_FAST ? { queryFast: env.WIKI_MODEL_FAST } : {}),
        queryStrong: env.WIKI_MODEL_STRONG ?? "gemini-2.5-pro",
      },
      embedModel: env.WIKI_EMBED_MODEL ?? "text-embedding-004",
      dimensionality: Number(env.WIKI_EMBED_DIM ?? "768"),
    };
  }
  const openai = createOpenAI({ apiKey: required(env, "OPENAI_API_KEY") });
  return {
    provider: {
      languageModel: (name) => openai(name),
      textEmbeddingModel: (name) => openai.embeddingModel(name),
    },
    models: {
      default: env.WIKI_MODEL ?? "gpt-4.1-mini",
      ...(env.WIKI_MODEL_FAST ? { queryFast: env.WIKI_MODEL_FAST } : {}),
      queryStrong: env.WIKI_MODEL_STRONG ?? "gpt-4.1",
    },
    embedModel: env.WIKI_EMBED_MODEL ?? "text-embedding-3-small",
    dimensionality: Number(env.WIKI_EMBED_DIM ?? "1536"),
  };
}
