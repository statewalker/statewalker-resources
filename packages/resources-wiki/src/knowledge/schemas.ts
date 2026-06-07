import { z } from "zod";

/** One L2 section in the summarizer's structured output. */
export const sectionSummarySchema = z
  .object({
    key: z
      .string()
      .min(1)
      .describe(
        "Kebab-case slug (ASCII alphanumeric plus '-') derived from the section title. Stable across re-ingests: prefer reusing a prior key when the section is semantically equivalent.",
      ),
    title: z
      .string()
      .describe(
        "Human-readable section heading drawn from the source (or paraphrased when the source has no explicit heading).",
      ),
    startLine: z
      .number()
      .int()
      .nonnegative()
      .describe("0-indexed inclusive line number in the raw text where this section begins."),
    endLine: z
      .number()
      .int()
      .nonnegative()
      .describe("0-indexed inclusive line number in the raw text where this section ends."),
    summary: z
      .string()
      .describe("Pure narrative summary of this section. NEVER verbatim raw text."),
  })
  .describe("One L2 section: a navigation aid spanning a contiguous range of raw lines.");

/** The summarizer's structured output: title + abstract + ordered sections. */
export const documentSummarySchema = z
  .object({
    title: z
      .string()
      .describe(
        "Natural document title — use the source's explicit title when present, otherwise a concise descriptive title.",
      ),
    summary: z
      .string()
      .describe("Document-level abstract — 1–3 sentences concatenating the section themes."),
    sections: z
      .array(sectionSummarySchema)
      .min(1)
      .describe(
        "Ordered list of L2 sections covering the full document. Normal documents have 3–15 sections; tiny snippets may have 1. NEVER 30+.",
      ),
  })
  .describe("L2 narrative summary of a single source.");

const rawLineSchema = z
  .tuple([
    z.number().int().nonnegative().describe("0-indexed line number in the raw text."),
    z.string().describe("Verbatim line content."),
  ])
  .describe("One raw line as a [lineNumber, text] pair.");

/** What the summarizer LLM call receives. */
export const summarizerInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    rawLines: z
      .array(rawLineSchema)
      .describe(
        "The document's raw text as numbered lines. Section ranges reference these numbers.",
      ),
  })
  .describe("Summarizer input: a document's numbered raw lines.");

export type DocumentSummaryOutput = z.infer<typeof documentSummarySchema>;
export type SummarizerInput = z.infer<typeof summarizerInputSchema>;
