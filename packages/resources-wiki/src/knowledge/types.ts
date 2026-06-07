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
  /** ISO timestamp of when this summary was generated. */
  generated: string;
  title: string;
  /** Document-level abstract (1–3 sentences). */
  summary: string;
  /** Between 1 and ~15 sections in normal documents. */
  sections: SectionSummary[];
}
