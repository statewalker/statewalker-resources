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

// Lenient on purpose: no `.length(3)` / element `.min(1)` constraints. With
// `strictJsonSchema: false` the schema is NOT enforced during generation, so a
// single off-shape triple (missing field, 2- or 4-element array) would make the
// WHOLE-document parse throw and drop the document. Triple shape is enforced
// deterministically afterwards (see `filterUnknownSubjects`), matching how
// unknown subjects are already handled.
const tripleArraySchema = z
  .array(z.string())
  .describe(
    "[subject, predicate, object] triple — exactly three non-empty strings. Subject (index 0) MUST be an entity.value declared in this document's graph. Off-shape triples are dropped by the runtime filter.",
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

// ── Reorganizer (LLM topic merge) ────────────────────────────────────────────
// Ported from wiki-runtime's reorganizeActionsSchema / reorganizerInputSchema.
// Candidates are grouped by key, so every action carries a `perDocUris` array.

export const reorganizeActionSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("match-existing"),
        globalKey: z
          .string()
          .min(1)
          .describe("Existing global topic key slug to record the candidate under."),
        perDocUris: z
          .array(z.string().min(1))
          .min(1)
          .describe("'<uri>#<per-doc-topic-key>' references to record under the existing global."),
      })
      .describe(
        "The candidate matches an existing global topic. Prefer this over coining a new one.",
      ),
    z
      .object({
        kind: z.literal("extend-existing"),
        globalKey: z.string().min(1).describe("Existing global topic key to extend."),
        descriptionExtension: z
          .string()
          .min(1)
          .describe(
            "One sentence appended to the existing description; the original is preserved verbatim.",
          ),
        perDocUris: z
          .array(z.string().min(1))
          .min(1)
          .describe("'<uri>#<per-doc-topic-key>' references to record under the extended global."),
      })
      .describe(
        "The candidate overlaps an existing global but adds a facet its description lacks.",
      ),
    z
      .object({
        kind: z.literal("new-global"),
        name: z
          .string()
          .min(1)
          .describe("Generic, reusable global topic name. NEVER instance-specific."),
        description: z
          .string()
          .min(1)
          .describe("One-line generic description for the new global topic."),
        perDocUris: z
          .array(z.string().min(1))
          .min(1)
          .describe("'<uri>#<per-doc-topic-key>' references that seed the new global topic."),
      })
      .describe("The candidate fits no existing global — coin a new one. Last resort."),
  ])
  .describe("One reorganization decision for a leftover candidate topic group.");

export const reorganizeActionsSchema = z
  .object({
    actions: z
      .array(reorganizeActionSchema)
      .describe("One action per leftover candidate group. May be empty."),
  })
  .describe(
    "Output of the LLM reorganize round; drives mechanical updates to the global topic index.",
  );

export const reorganizerCandidateSchema = z
  .object({
    key: z.string().describe("Candidate's per-doc key slug (not yet in the global index)."),
    name: z.string().describe("Candidate's name."),
    description: z.string().describe("Candidate's abstract description (may be empty)."),
    perDocUris: z
      .array(z.string().min(1))
      .min(1)
      .describe("'<uri>#<key>' references this candidate group carries."),
  })
  .describe("One leftover per-doc topic group the reorganizer must place in the global index.");

export const reorganizerExistingTopicSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
  })
  .describe("Existing global topic entry the reorganizer may match against or extend.");

export const reorganizerInputSchema = z
  .object({
    existingTopics: z
      .array(reorganizerExistingTopicSchema)
      .describe("Current global topics — preferred targets for match / extend actions."),
    candidates: z
      .array(reorganizerCandidateSchema)
      .describe("Leftover per-doc topic groups not absorbed by the exact-key pre-merge."),
  })
  .describe("Input to the LLM reorganize round. Returns ReorganizeActions.");

export type DocumentSummaryOutput = z.infer<typeof documentSummarySchema>;
export type SummarizerInput = z.infer<typeof summarizerInputSchema>;
export type DocumentMetaOutput = z.infer<typeof documentMetaSchema>;
export type DocumentGraphOutput = z.infer<typeof documentGraphSchema>;
export type ReorganizeActions = z.infer<typeof reorganizeActionsSchema>;
export type ReorganizeAction = ReorganizeActions["actions"][number];
export type ReorganizerInput = z.infer<typeof reorganizerInputSchema>;
