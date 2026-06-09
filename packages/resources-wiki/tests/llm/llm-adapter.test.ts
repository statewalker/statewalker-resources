// Coverage for the generic LlmProjectAdapter (structured generation usage +
// maxOutputTokens forwarding, embeddings) and the wiki-specific WikiLlmConfiguration
// stage→model-name resolution.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmProjectAdapter, type LlmProvider, WikiLlmConfiguration } from "../../src/index.js";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: vi.fn(), embed: vi.fn(), embedMany: vi.fn() };
});

const {
  generateText: mockGenerateText,
  embed: mockEmbed,
  embedMany: mockEmbedMany,
} = await import("ai");

// Provider stub: model "names" pass straight through (generateText/embed are mocked).
const provider: LlmProvider = {
  languageModel: (name) => name as unknown as ReturnType<LlmProvider["languageModel"]>,
  textEmbeddingModel: (name) => name,
};
const adapter = new LlmProjectAdapter({ provider });

const inputSchema = z.object({ q: z.string() });
const outputSchema = z.object({ a: z.string() });

describe("WikiLlmConfiguration — stage→model resolution", () => {
  it("returns the stage model when set, else falls back to default", () => {
    const cfg = new WikiLlmConfiguration({
      models: { default: "model-a", summarize: "model-b" },
      embedModel: "embed-x",
      dimensionality: 3,
      corpusPurpose: "purpose",
    });
    expect(cfg.modelFor("summarize")).toBe("model-b");
    expect(cfg.modelFor("meta")).toBe("model-a");
    expect(cfg.modelFor("graph")).toBe("model-a");
    expect(cfg.embedModel).toBe("embed-x");
    expect(cfg.dimensionality).toBe(3);
    expect(cfg.corpusPurpose).toBe("purpose");
  });
});

describe("LlmProjectAdapter.generateObject", () => {
  it("resolves the model name via the provider and surfaces token usage", async () => {
    vi.mocked(mockGenerateText).mockResolvedValueOnce({
      output: { a: "hi" },
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
    } as never);
    const result = await adapter.generateObject({
      name: "usage-call",
      model: "gpt-x",
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
    });
    expect(result.output).toEqual({ a: "hi" });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(vi.mocked(mockGenerateText).mock.calls.at(-1)?.[0]?.model).toBe("gpt-x");
  });

  it("normalises missing usage fields to 0", async () => {
    vi.mocked(mockGenerateText).mockResolvedValueOnce({ output: { a: "hi" } } as never);
    const result = await adapter.generateObject({
      name: "missing-usage",
      model: "m",
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
    });
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("forwards spec.maxOutputTokens, defaulting to 256k when absent", async () => {
    vi.mocked(mockGenerateText).mockResolvedValue({
      output: { a: "ok" },
      usage: { inputTokens: 1, outputTokens: 1 },
    } as never);
    await adapter.generateObject({
      name: "cap",
      model: "m",
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
      maxOutputTokens: 8_192,
    });
    expect(vi.mocked(mockGenerateText).mock.calls.at(-1)?.[0]?.maxOutputTokens).toBe(8_192);

    await adapter.generateObject({
      name: "default-cap",
      model: "m",
      system: "s",
      input: { q: "q" },
      inputSchema,
      outputSchema,
    });
    expect(vi.mocked(mockGenerateText).mock.calls.at(-1)?.[0]?.maxOutputTokens).toBe(256 * 1024);
  });
});

describe("LlmProjectAdapter embeddings", () => {
  it("embeds a single text into a Float32Array", async () => {
    vi.mocked(mockEmbed).mockResolvedValueOnce({ embedding: [1, 2, 3] } as never);
    const v = await adapter.embed("hello", "embed-x");
    expect(v).toBeInstanceOf(Float32Array);
    expect([...v]).toEqual([1, 2, 3]);
  });

  it("batch-embeds many texts and returns [] for an empty batch without calling the provider", async () => {
    vi.mocked(mockEmbedMany).mockResolvedValueOnce({ embeddings: [[1], [2]] } as never);
    const vs = await adapter.embedBatch(["a", "b"], "embed-x");
    expect(vs.map((v) => [...v])).toEqual([[1], [2]]);

    vi.mocked(mockEmbedMany).mockClear();
    expect(await adapter.embedBatch([], "embed-x")).toEqual([]);
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });
});
