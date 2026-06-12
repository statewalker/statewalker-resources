import type { Project } from "@statewalker/resources-workspace";
import type { Answer, EvidenceSection, QueryProgress } from "../progress.js";
import { orderEvidence } from "./retrieval.js";

/**
 * Typed per-query state for the query FSM.
 *
 * FSM events carry no payload, so every datum crossing a state boundary lives on
 * this single context instance. `project` / `request` / `progress` are injected at
 * launch; per-query data is held in private, default-initialized fields that stages
 * read via getters and produce via the semantic methods below. Project-global
 * capabilities (LLM, wiki config) are NOT carried here — handlers reach them via
 * `llmOf(ctx.project)` / `wikiConfigOf(ctx.project)`.
 */

/** The user's query as supplied to `ask`. */
export interface QueryRequest {
  question: string;
}

/** One distinct subject the prompt decomposes into, re-formulated as a search prompt. */
export interface Subject {
  /** Standalone, vault-aligned search prompt for this subject. */
  prompt: string;
}

/** IntentDetection output: on/off-corpus plus the decomposed subjects. */
export interface IntentResult {
  onCorpus: boolean;
  subjects: Subject[];
  /** Why the prompt was judged off-corpus (when `onCorpus` is false). */
  offCorpusReason?: string;
}

/** A rolling summary: prose plus the `[[uri#section]]` chapter refs it preserves. */
export interface Summary {
  text: string;
  refs: string[];
}

/** One subject's relevant evidence sections, document-ordered, after the section filter. */
export interface SubjectGroup {
  /** The subject prompt this group serves (steers its rolling summary). */
  prompt: string;
  sections: EvidenceSection[];
}

/**
 * A retrieved section before the relevance filter: the resolved evidence plus its
 * retrieval signal — `score` (how many front-ends surfaced it: 1, or 2 when both
 * hybrid search AND the topic ladder did) and the subject indices it served.
 */
export interface Candidate {
  section: EvidenceSection;
  score: number;
  subjects: number[];
}

const EMPTY_INTENT: IntentResult = { onCorpus: false, subjects: [] };
const EMPTY_ANSWER: Answer = {
  text: "",
  citations: [],
  caveats: [],
  suggestions: [],
  topics: [],
  outliers: [],
  evidenceCount: 0,
};

export class QueryContext {
  constructor(
    readonly project: Project,
    readonly request: QueryRequest,
    readonly progress: QueryProgress,
  ) {}

  // ── per-query data (default-initialized; produced by a stage, read by later ones) ──
  #intent: IntentResult = EMPTY_INTENT;
  #candidates: Candidate[] = [];
  /** Next score-tier index SelectSections will consume (0 = both front-ends, then 1 = the rest). */
  #tier = 0;
  /** The selected-section union so far, accumulated across tiers. */
  #evidence: EvidenceSection[] = [];
  /** THIS tier's newly-selected sections grouped by subject (set by SelectSections; folded by Summarize). */
  #groups: SubjectGroup[] = [];
  #summaries: Summary[] = [];
  #answer: Answer = EMPTY_ANSWER;

  get intent(): IntentResult {
    return this.#intent;
  }
  setIntent(intent: IntentResult): void {
    this.#intent = intent;
  }

  get candidates(): Candidate[] {
    return this.#candidates;
  }
  setCandidates(candidates: Candidate[]): void {
    this.#candidates = candidates;
  }

  get tier(): number {
    return this.#tier;
  }
  /** Advance to the next retrieval tier. */
  advanceTier(): void {
    this.#tier += 1;
  }

  get groups(): SubjectGroup[] {
    return this.#groups;
  }
  setGroups(groups: SubjectGroup[]): void {
    this.#groups = groups;
  }

  get evidence(): EvidenceSection[] {
    return this.#evidence;
  }
  /** Union `sections` into the accumulated, document-ordered evidence and keep `progress.evidence` in sync. */
  async addEvidence(sections: EvidenceSection[]): Promise<void> {
    this.#evidence = await orderEvidence(this.project, [...this.#evidence, ...sections]);
    this.progress.evidence = this.#evidence;
  }

  get summaries(): Summary[] {
    return this.#summaries;
  }
  /** Append this tier's fresh summaries to the rolling list. */
  addSummaries(summaries: Summary[]): void {
    this.#summaries = [...this.#summaries, ...summaries];
  }

  get answer(): Answer {
    return this.#answer;
  }
  setAnswer(answer: Answer): void {
    this.#answer = answer;
  }
}
