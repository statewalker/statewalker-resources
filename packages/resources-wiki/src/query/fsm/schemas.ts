import { z } from "zod";

/** A topic/outlier class as offered to the selection LLMs (no documents attached). */
const availableClassSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

// ── IntentDetection ──────────────────────────────────────────────────────────
export const intentDetectionInputSchema = z.object({
  question: z.string(),
  availableTopics: z.array(availableClassSchema),
  availableOutliers: z.array(availableClassSchema),
});
export const intentDetectionSchema = z
  .object({
    onCorpus: z
      .boolean()
      .describe(
        "Recall-first scope flag. True unless the prompt is not a retrieval request against this corpus at all. A prompt naming specific entities, facts, or relationships is on-corpus EVEN WHEN no topic class matches — downstream full-text + semantic search is the real gate, not the topic vocabulary.",
      ),
    offCorpusReason: z
      .string()
      .nullable()
      .describe(
        "When onCorpus is false, a one-line reason the prompt is not a retrieval request against this corpus; null otherwise.",
      ),
    subjects: z
      .array(z.object({ prompt: z.string() }))
      .describe(
        "The distinct subjects the prompt decomposes into, each re-formulated as a standalone search prompt. PRESERVE named entities and specific terms (proper nouns, organisations, people, places, tickers) verbatim — they drive full-text retrieval. Use one subject for a single-subject prompt.",
      ),
  })
  .describe("On/off-corpus classification plus subject decomposition. Does NOT answer the prompt.");

// ── TopicSelect (per subject) ────────────────────────────────────────────────
export const topicSelectInputSchema = z.object({
  subject: z.string().describe("The subject being routed."),
  availableTopics: z.array(availableClassSchema),
  availableOutliers: z.array(availableClassSchema),
});
export const topicSelectSchema = z
  .object({
    topicKeys: z
      .array(z.string())
      .describe(
        "Topic-class key slugs (from availableTopics) plausibly relevant to the subject. Be exhaustive — prefer over-inclusion. MUST be drawn from the supplied keys.",
      ),
    outlierKeys: z
      .array(z.string())
      .describe(
        "Outlier-class key slugs (from availableOutliers) plausibly relevant to the subject. MUST be drawn from the supplied keys.",
      ),
  })
  .describe(
    "Selected topic + outlier class keys for one subject, drawn only from the supplied lists.",
  );

// ── SectionFilter (relevance filter over one token-bounded, doc-grouped batch) ─
export const sectionFilterInputSchema = z.object({
  question: z.string().describe("The full original prompt."),
  documents: z
    .array(
      z.object({
        title: z.string().describe("Source document title."),
        sections: z.array(
          z.object({
            uri: z
              .string()
              .describe(
                "The section URI (`<docUri>#<sectionKey>`) — echo this verbatim to keep it.",
              ),
            title: z.string(),
            summary: z.string().optional(),
          }),
        ),
      }),
    )
    .describe("Candidate sections grouped by their source document."),
});
export const sectionFilterSchema = z
  .object({
    relevantUris: z
      .array(z.string())
      .describe(
        "The URIs (verbatim) of sections that could plausibly contain facts answering the prompt. Drop sections unrelated to it; return an empty array when none qualify.",
      ),
  })
  .describe("The relevant section URIs in this batch. Selection only — do not answer the prompt.");

// ── Summarize (one batch of sections → one summary, batches run in parallel) ──
export const summarizeInputSchema = z.object({
  /** The original prompt; only facts relevant to it are kept. */
  question: z.string(),
  /** XML-tagged batch: one <section_title>/<section_description>/<raw_content> block per section. */
  sections: z.string(),
});
export const summarizeSchema = z.object({
  text: z
    .string()
    .describe(
      "A dense, fact-only summary of this batch serving the question, keeping every [[<uri>#<section>]] marker.",
    ),
});

// ── Respond ──────────────────────────────────────────────────────────────────
export const composeInputSchema = z.object({
  question: z.string(),
  summaries: z.array(
    z.object({
      text: z.string(),
      /** The `[[/path#section]]` markers grounding this summary — the citations the answer may use. */
      refs: z.array(z.string()),
    }),
  ),
});
// Strict-compatible (OpenAI strict structured outputs): every field required, `missing` nullable.
// The answer is a list of CLAIMS, each carrying its own citations — grounding is structural: the
// model cannot emit a claim without a citations field.
export const composeSchema = z.object({
  claims: z
    .array(
      z.object({
        statement: z
          .string()
          .describe("One self-contained claim — a sentence or bullet; may include markdown."),
        citations: z
          .array(z.string())
          .describe(
            "The `[[/path#section]]` refs (verbatim from the summaries' refs) grounding THIS statement. At least one; omit the claim entirely if you cannot cite it.",
          ),
      }),
    )
    .describe("The answer as ordered, individually-grounded claims."),
  suggestions: z.array(z.string()),
  sufficient: z
    .boolean()
    .describe(
      "True if the summaries fully answer the prompt; false if key information is missing.",
    ),
  missing: z
    .string()
    .nullable()
    .describe(
      "When not sufficient, a short description of the information still needed; null otherwise.",
    ),
});
