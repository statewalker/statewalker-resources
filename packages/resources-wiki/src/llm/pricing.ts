import type { LlmCallUsage } from "./llm-adapter.js";

/**
 * Per-model token prices in USD per 1,000,000 tokens, used to annotate LLM-call
 * stats with an estimated cost. Prices are provider list prices as of 2026-06 and
 * WILL drift — update this table (or extend it for new models) as prices change.
 * An unknown model yields a zero cost (the stats still log token counts).
 */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  // Google Gemini
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "text-embedding-004": { input: 0, output: 0 },
};

/** Estimated USD cost of one LLM call, split by input/output tokens. */
export interface LlmCallCost {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

const ZERO: LlmCallCost = { inputUsd: 0, outputUsd: 0, totalUsd: 0 };

/** Cost of a call's token usage at the model's list price (zeros for an unknown model). */
export function costOf(model: string, usage: LlmCallUsage): LlmCallCost {
  const price = MODEL_PRICES[model];
  if (!price) return ZERO;
  const inputUsd = (usage.inputTokens / 1_000_000) * price.input;
  const outputUsd = (usage.outputTokens / 1_000_000) * price.output;
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

/** Sum a set of costs (e.g. across the calls of a batch). */
export function sumCosts(costs: readonly LlmCallCost[]): LlmCallCost {
  return costs.reduce(
    (acc, c) => ({
      inputUsd: acc.inputUsd + c.inputUsd,
      outputUsd: acc.outputUsd + c.outputUsd,
      totalUsd: acc.totalUsd + c.totalUsd,
    }),
    { ...ZERO },
  );
}

/** Round a USD amount for logging (6 decimals — costs are fractions of a cent). */
export function roundUsd(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
