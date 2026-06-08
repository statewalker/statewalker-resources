// ── Raw text cache metadata (ContentCache) ─────────────────────────────────

/**
 * Metadata about a page's cached raw text (`raw.txt`). Its `hash` is the SHA-256
 * of the original source bytes; the build stages compare it against the
 * `sourceHash` they recorded to skip re-running on unchanged sources.
 */
export interface RawMeta {
  /** SHA-256 (hex) of the original source bytes. */
  hash: string;
  /** Source size in bytes. */
  bytes: number;
  generated: string;
}

// ── L2 narrative summary (Summarizer) ──────────────────────────────────────

/** One L2 section: a contiguous range of raw lines summarised as prose. */
export interface SectionSummary {
  /** Kebab-case slug; stable across re-ingests when the section is semantically the same. */
  key: string;
  title: string;
  /** 0-indexed inclusive line range in the raw text. */
  startLine: number;
  endLine: number;
  /** Narrative summary of the section — never verbatim raw. */
  summary: string;
}

/** The L2 narrative summary of a single source. */
export interface DocumentSummary {
  uri: string;
  generated: string;
  /** SHA-256 of the source this summary was derived from (see {@link RawMeta}). */
  sourceHash: string;
  title: string;
  /** Document-level abstract (1–3 sentences). */
  summary: string;
  /** Between 1 and ~15 sections in normal documents. */
  sections: SectionSummary[];
}

// ── L2.5 topic / outlier declarations (MetaExtractor) ───────────────────────

export interface DocumentTopic {
  key: string;
  name: string;
  /** Abstract one-line definition; present whether coined or reused (copied verbatim on reuse). */
  description?: string;
  sectionKeys: string[];
  /** This source's specific contribution to the class. */
  brief: string;
}

export interface DocumentOutlier {
  key: string;
  name: string;
  description?: string;
  globalClass?: string;
  sectionKeys: string[];
  brief: string;
  /** One sentence on what expectation the finding violates. */
  whySurprising: string;
}

export interface DocumentMeta {
  uri: string;
  generated: string;
  /** SHA-256 of the source this meta was derived from (see {@link RawMeta}). */
  sourceHash: string;
  topics: DocumentTopic[];
  outliers: DocumentOutlier[];
}

// ── Per-section graph (GraphExtractor) ──────────────────────────────────────

export interface Entity {
  /** Canonical name; stable across re-ingests. */
  value: string;
  /** Open enum: person, organisation, place, paper, tool, dataset, algorithm, … */
  type?: string;
}

/** `[subject, predicate, object]`. Subject MUST be an entity.value. */
export type Triple = readonly string[];
export type Statement = Triple;
export type Relation = Triple;

export interface SectionGraph {
  sectionKey: string;
  entities: Entity[];
  statements: Statement[];
  relations: Relation[];
}

export interface DocumentGraph {
  uri: string;
  generated: string;
  /** SHA-256 of the source this graph was derived from (see {@link RawMeta}). */
  sourceHash: string;
  sections: SectionGraph[];
}

// ── Global aggregated indexes (Reorganizer) ─────────────────────────────────

export interface ClassReference {
  uri: string;
}

export interface GlobalTopic {
  key: string;
  name: string;
  description: string;
  references: ClassReference[];
}

export interface GlobalOutlier {
  key: string;
  name: string;
  description: string;
  references: ClassReference[];
}

export interface TopicIndex {
  generated: string;
  topics: GlobalTopic[];
}

export interface OutlierIndex {
  generated: string;
  outliers: GlobalOutlier[];
}

/** An already-coined class, supplied to the meta extractor to encourage reuse. */
export interface ExistingClass {
  kind: "topic" | "outlier";
  key: string;
  name: string;
  description: string;
}
