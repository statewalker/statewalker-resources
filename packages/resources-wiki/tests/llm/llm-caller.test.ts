// Migrated from wiki-runtime/tests/llm-caller.test.ts — parity coverage for the
// lifted LLM caller (spec shape, stage-routed model resolution, usage normalization,
// and maxOutputTokens forwarding).
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type LlmCaller,
  type LlmCallSpec,
  type LlmModels,
  resolveModel,
  vercelLlmCaller,
} from "../../src/index.js";

const stubModel = "stub-model" as unknown as LlmModels["default"];

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: vi.fn() };
});

const { generateText: mockedGenerateText } = await import("ai");

describe("LlmCaller contract — spec shape", () => {
  const inputSchema = z.object({ q: z.string() }).describe("Input.");
  const outputSchema = z.object({ a: z.string() }).describe("Output.");

  it("carries a name, system prompt, input + inputSchema, outputSchema", async () => {
    let captured: LlmCallSpec<{ q: string }, { a: string }> | undefined;
    const llm: LlmCaller = {
      generate: async (spec) => {
        captured = spec as LlmCallSpec<{ q: string }, { a: string }>;
        return { output: { a: "answer" }, usage: { inputTokens: 0, outputTokens: 0 } } as never;
      },
    };
    const result = await llm.generate({
      name: "my-call",
      model: stubModel,
      system: "system text",
      input: { q: "question" },
      inputSchema,
      outputSchema,
    });
    expect(result.output).toEqual({ a: "answer" });
    expect(captured?.name).toBe("my-call");
    expect(captured?.system).toBe("system text");
    expect(captured?.input).toEqual({ q: "question" });
    expect(captured?.inputSchema).toBe(inputSchema);
    expect(captured?.outputSchema).toBe(outputSchema);
  });

  it("supports stage-routed model resolution via resolveModel", () => {
    const a = "model-a" as unknown as LlmModels["default"];
    const b = "model-b" as unknown as LlmModels["default"];
    const models: LlmModels = { default: a, summarize: b };
    expect(resolveModel(models, "summarize")).toBe(b);
    expect(resolveModel(models, "meta")).toBe(a);
    expect(resolveModel(models, "graph")).toBe(a);
  });
});

describe("vercelLlmCaller usage exposure", () => {
  const inputSchema = z.object({ q: z.string() });
  const outputSchema = z.object({ a: z.string() });

  it("surfaces provider-reported input/output token counts", async () => {
    vi.mocked(mockedGenerateText).mockResolvedValueOnce({
      output: { a: "hi" },
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
    } as never);
    const result = await vercelLlmCaller().generate({
      name: "usage-call",
      model: stubModel,
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
    });
    expect(result.output).toEqual({ a: "hi" });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
  });

  it("normalises missing usage fields to 0", async () => {
    vi.mocked(mockedGenerateText).mockResolvedValueOnce({ output: { a: "hi" } } as never);
    const result = await vercelLlmCaller().generate({
      name: "missing-usage-call",
      model: stubModel,
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
    });
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("forwards spec.maxOutputTokens to generateText when set", async () => {
    vi.mocked(mockedGenerateText).mockResolvedValueOnce({
      output: { a: "ok" },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);
    await vercelLlmCaller().generate({
      name: "cap-call",
      model: stubModel,
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
      maxOutputTokens: 8_192,
    });
    const lastCall = vi.mocked(mockedGenerateText).mock.calls.at(-1)?.[0] as
      | { maxOutputTokens?: number }
      | undefined;
    expect(lastCall?.maxOutputTokens).toBe(8_192);
  });

  it("falls back to the default cap when spec.maxOutputTokens is absent", async () => {
    vi.mocked(mockedGenerateText).mockResolvedValueOnce({
      output: { a: "ok" },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);
    await vercelLlmCaller().generate({
      name: "default-cap-call",
      model: stubModel,
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
    });
    const lastCall = vi.mocked(mockedGenerateText).mock.calls.at(-1)?.[0] as
      | { maxOutputTokens?: number }
      | undefined;
    expect(lastCall?.maxOutputTokens).toBe(256 * 1024);
  });
});
