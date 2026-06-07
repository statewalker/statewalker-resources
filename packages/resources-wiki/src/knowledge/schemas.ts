import { z } from "zod";

// ── Summarizer ──────────────────────────────────────────────────────────────

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

// ── Meta (topics + outliers) ─────────────────────────────────────────────────

export const documentTopicSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .describe(
        "Generic class slug (kebab-case). For an existing class, reuse its slug verbatim. NEVER instance-specific (use 'company-founders', not 'acme-founders').",
      ),
    name: z.string().describe("Generic class name. NEVER instance-specific."),
    description: z
      .string()
      .min(1)
      .describe(
        "ABSTRACT one-line definition of the class, document-independent. When reusing an existing class, COPY its description verbatim.",
      ),
    sectionKeys: z
      .array(z.string())
      .min(1)
      .describe("Section keys (from the summary) where this class is covered. Non-empty."),
    brief: z
      .string()
      .min(1)
      .describe("Per-source-per-class brief — what THIS source specifically contributes."),
  })
  .describe("Per-document topic-class declaration.");

export const documentOutlierSchema = z
  .object({
    key: z.string().min(1).describe("Outlier class slug (kebab-case, generic)."),
    name: z.string().describe("Outlier class name. Generic."),
    description: z
      .string()
      .min(1)
      .describe("ABSTRACT one-line definition of the outlier class. Copy verbatim when reusing."),
    globalClass: z
      .string()
      .optional()
      .describe("Optional global outlier-class slug when the per-doc key differs."),
    sectionKeys: z.array(z.string()).min(1).describe("Section keys where the finding surfaces."),
    brief: z.string().min(1).describe("Per-source brief of the surprising finding."),
    whySurprising: z
      .string()
      .describe("One sentence explaining what expectation the finding violates. REQUIRED."),
  })
  .describe("Per-document outlier-class declaration; only when the source itself flags surprise.");

export const documentMetaSchema = z
  .object({
    topics: z
      .array(documentTopicSchema)
      .describe("Topic classes covered. Max ~6 per source; most cover 2–4. Empty array is fine."),
    outliers: z
      .array(documentOutlierSchema)
      .describe("Source-flagged surprises. Empty when nothing is flagged surprising."),
  })
  .describe("L2.5 forward-declaration layer for a single source.");

export const existingClassSchema = z
  .object({
    kind: z.enum(["topic", "outlier"]),
    key: z.string(),
    name: z.string(),
    description: z.string(),
  })
  .describe("An already-coined class. Reuse its key verbatim; copy its description when reusing.");

export const metaExtractorInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    summary: documentSummarySchema.describe(
      "The L2 summary the declarations point at via sectionKeys.",
    ),
    existingClasses: z
      .array(existingClassSchema)
      .describe("Already-coined classes across the corpus. Reuse keys; copy descriptions."),
  })
  .describe("Input to the meta extraction call. Returns DocumentMeta.");

// ── Graph (entities + statements + relations) ────────────────────────────────

export const entitySchema = z
  .object({
    value: z
      .string()
      .min(1)
      .describe("Canonical entity name. Stable across sections / re-ingests."),
    type: z
      .string()
      .optional()
      .describe("Open lowercase enum: person, organisation, place, paper, tool, dataset, …"),
  })
  .describe("An actor / method / dataset / concept the section is about.");

const tripleArraySchema = z
  .array(z.string().min(1))
  .length(3)
  .describe(
    "[subject, predicate, object] triple. Subject (index 0) MUST be an entity.value declared in this document's graph.",
  );

export const statementSchema = tripleArraySchema.describe(
  "Entity-attribute fact: subject is an entity.value, object is a stringified literal.",
);
export const relationSchema = tripleArraySchema.describe(
  "Entity-to-entity fact: both subject and object are entity.value strings.",
);

export const sectionGraphSchema = z
  .object({
    sectionKey: z
      .string()
      .min(1)
      .describe("Section key — matches a DocumentSummary.sections[].key."),
    entities: z.array(entitySchema).describe("Entities introduced or referenced by this section."),
    statements: z.array(statementSchema).describe("Entity-to-literal findings/conclusions."),
    relations: z.array(relationSchema).describe("Entity-to-entity structural facts."),
  })
  .describe("Structured signal for one section of the document.");

export const documentGraphSchema = z
  .object({
    sections: z
      .array(sectionGraphSchema)
      .describe("One graph per L2 section, in the same order as the summary's sections."),
  })
  .describe("Per-document structured-signal layer.");

export const graphExtractorInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    sections: z
      .array(sectionSummarySchema)
      .describe(
        "Sections of the document — output sectionKey values must match these section.key values.",
      ),
  })
  .describe("Input to the per-section graph extraction call. Returns DocumentGraph.");

export type DocumentSummaryOutput = z.infer<typeof documentSummarySchema>;
export type SummarizerInput = z.infer<typeof summarizerInputSchema>;
export type DocumentMetaOutput = z.infer<typeof documentMetaSchema>;
export type DocumentGraphOutput = z.infer<typeof documentGraphSchema>;
