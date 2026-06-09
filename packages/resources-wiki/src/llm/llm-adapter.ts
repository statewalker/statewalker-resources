import type { Project } from "@statewalker/resources-workspace";
import {
  embed as aiEmbed,
  embedMany as aiEmbedMany,
  generateText,
  type LanguageModel,
  Output,
  streamText,
} from "ai";
import type { z } from "zod";

/** The embedding-model type the SDK's `embed`/`embedMany` expect (provider/version-specific). */
type EmbeddingModelArg = Parameters<typeof aiEmbed>[0]["model"];

/**
 * A provider capability: resolve a model *name* to a runtime language/embedding
 * model. Both `createOpenAI(...)` and `createGoogleGenerativeAI(...)` satisfy this
 * shape (the callable is the language model; `.embeddingModel` the embedding
 * model). The composition root adapts a concrete provider into this interface.
 */
export interface LlmProvider {
  languageModel(name: string): LanguageModel;
  textEmbeddingModel(name: string): EmbeddingModelArg;
}

export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Structured-object generation call. `model` is a model *name* resolved by the provider. */
export interface GenerateObjectSpec<TInput, TOutput> {
  name: string;
  description?: string;
  /** Model name (resolved against the provider), e.g. from `WikiLlmConfiguration.modelFor`. */
  model: string;
  /** Already-rendered system prompt. */
  system: string;
  input: TInput;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
}

/** Free-form text generation call (used by `generateText` / `streamText`). */
export interface GenerateTextSpec {
  name?: string;
  model: string;
  system?: string;
  prompt: string;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
}

/**
 * The generic LLM project adapter's public surface: structured-object generation,
 * free-form text generation (whole + streaming), and embeddings. Provider-agnostic
 * so tests can register a stub under the `LlmProjectAdapter` key.
 */
export interface LlmApi {
  generateObject<TInput, TOutput>(
    spec: GenerateObjectSpec<TInput, TOutput>,
  ): Promise<{ output: TOutput; usage: LlmCallUsage }>;
  generateText(spec: GenerateTextSpec): Promise<{ text: string; usage: LlmCallUsage }>;
  streamText(spec: GenerateTextSpec): AsyncIterable<string>;
  embed(text: string, model: string): Promise<Float32Array>;
  embedBatch(texts: string[], model: string): Promise<Float32Array[]>;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 256 * 1024;

function normalizeUsage(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
): LlmCallUsage {
  return { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 };
}

/**
 * Generic LLM access as a project adapter — wraps the Vercel AI SDK over a
 * {@link LlmProvider}. Gives builders/query a single handle for structured
 * generation, text generation, and embeddings, decoupled from which concrete
 * model each wiki stage uses (that policy lives in {@link WikiLlmConfiguration}).
 */
export class LlmProjectAdapter implements LlmApi {
  private readonly provider: LlmProvider;

  constructor(opts: { provider: LlmProvider }) {
    this.provider = opts.provider;
  }

  async generateObject<TInput, TOutput>(
    spec: GenerateObjectSpec<TInput, TOutput>,
  ): Promise<{ output: TOutput; usage: LlmCallUsage }> {
    const parsedInput = spec.inputSchema.parse(spec.input);
    const prompt = `Call: ${spec.name}\n\nInput (JSON):\n${JSON.stringify(parsedInput, null, 2)}`;
    const result = await generateText({
      model: this.provider.languageModel(spec.model),
      system: spec.system,
      prompt,
      output: Output.object({
        schema: spec.outputSchema,
        name: spec.name,
        description: spec.description,
      }),
      maxOutputTokens: spec.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: spec.abortSignal,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return {
      output: result.output as TOutput,
      usage: normalizeUsage(result.usage as { inputTokens?: number; outputTokens?: number }),
    };
  }

  async generateText(spec: GenerateTextSpec): Promise<{ text: string; usage: LlmCallUsage }> {
    const result = await generateText({
      model: this.provider.languageModel(spec.model),
      system: spec.system,
      prompt: spec.prompt,
      maxOutputTokens: spec.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: spec.abortSignal,
    });
    return {
      text: result.text,
      usage: normalizeUsage(result.usage as { inputTokens?: number; outputTokens?: number }),
    };
  }

  async *streamText(spec: GenerateTextSpec): AsyncIterable<string> {
    const result = streamText({
      model: this.provider.languageModel(spec.model),
      system: spec.system,
      prompt: spec.prompt,
      maxOutputTokens: spec.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: spec.abortSignal,
    });
    for await (const delta of result.textStream) yield delta;
  }

  async embed(text: string, model: string): Promise<Float32Array> {
    const { embedding } = await aiEmbed({
      model: this.provider.textEmbeddingModel(model),
      value: text,
    });
    return new Float32Array(embedding);
  }

  async embedBatch(texts: string[], model: string): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const { embeddings } = await aiEmbedMany({
      model: this.provider.textEmbeddingModel(model),
      values: texts,
    });
    return embeddings.map((e) => new Float32Array(e));
  }
}

/** Resolve the generic LLM adapter from a project (mirrors `loggerOf`). */
export function llmOf(project: Project): LlmApi {
  return project.requireAdapter<LlmApi>(LlmProjectAdapter);
}
