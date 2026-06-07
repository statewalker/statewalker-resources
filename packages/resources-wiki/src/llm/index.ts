import { generateText, type LanguageModel, Output } from "ai";
import type { z } from "zod";

/**
 * The set of language models the wiki builders/query may use. Every stage falls
 * back to `default` when its specific model is unset (see `resolveModel`).
 */
export interface LlmModels {
  default: LanguageModel;
  summarize?: LanguageModel;
  meta?: LanguageModel;
  graph?: LanguageModel;
  reorganize?: LanguageModel;
  query?: LanguageModel;
  queryFast?: LanguageModel;
  queryStrong?: LanguageModel;
}

export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Strict-schema LLM call descriptor. */
export interface LlmCallSpec<TInput, TOutput> {
  name: string;
  description?: string;
  model: LanguageModel;
  /** Already-rendered system prompt. */
  system: string;
  input: TInput;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  abortSignal?: AbortSignal;
  maxOutputTokens?: number;
}

export interface LlmCaller {
  generate<TInput, TOutput>(
    spec: LlmCallSpec<TInput, TOutput>,
  ): Promise<{ output: TOutput; usage: LlmCallUsage }>;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 256 * 1024;

/** Production caller — `generateText` with structured `Output.object`. */
export function vercelLlmCaller(): LlmCaller {
  return {
    generate: async <TInput, TOutput>(spec: LlmCallSpec<TInput, TOutput>) => {
      const parsedInput = spec.inputSchema.parse(spec.input);
      const prompt = `Call: ${spec.name}\n\nInput (JSON):\n${JSON.stringify(parsedInput, null, 2)}`;
      const result = await generateText({
        model: spec.model,
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
      const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      return {
        output: result.output as TOutput,
        usage: {
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
        },
      };
    },
  };
}

/** Resolve the model for a stage, falling back to `default`. */
export function resolveModel(
  models: LlmModels,
  key: keyof Omit<LlmModels, "default">,
): LanguageModel {
  return models[key] ?? models.default;
}
