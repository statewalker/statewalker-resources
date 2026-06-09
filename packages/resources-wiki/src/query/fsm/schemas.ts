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
      .describe("True if the prompt concerns the vault's domain; false if out of scope."),
    offCorpusReason: z
      .string()
      .optional()
      .describe("When onCorpus is false, a one-line reason the prompt is out of scope."),
    subjects: z
      .array(z.object({ prompt: z.string() }))
      .describe(
        "The distinct subjects the prompt decomposes into, each re-formulated as a standalone, vault-aligned search prompt. Use one subject for a single-subject prompt.",
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

// ── DocTopicSelect (per subject) ─────────────────────────────────────────────
export const docTopicSelectInputSchema = z.object({
  subject: z.string(),
  candidates: z.array(
    z.object({
      uri: z.string(),
      name: z.string(),
      description: z.string().optional(),
      brief: z.string(),
    }),
  ),
});
export const docTopicSelectSchema = z
  .object({
    selected: z
      .array(z.string())
      .describe(
        "The `uri`s of the candidate document-topics to KEEP. Remove only the clearly non-relevant ones — recall-first. MUST be drawn from the supplied candidate uris.",
      ),
  })
  .describe("Document-topics kept after removing only clearly non-relevant ones.");

// ── Summarize (rolling fold, per chapter) ────────────────────────────────────
export const summarizeInputSchema = z.object({
  question: z.string(),
  /** XML-tagged fold input: previous_summary (optional) + section_title + section_description + raw_content. */
  section: z.string(),
});
export const summarizeSchema = z.object({
  text: z
    .string()
    .describe(
      "The updated rolling summary: dense, fact-only prose serving the question, keeping every [[<uri>#<section>]] marker.",
    ),
});

// ── Respond ──────────────────────────────────────────────────────────────────
export const composeInputSchema = z.object({
  question: z.string(),
  summaries: z.array(z.object({ text: z.string() })),
});
export const composeSchema = z.object({
  text: z.string(),
  citations: z.array(z.string()),
  suggestions: z.array(z.string()),
});
