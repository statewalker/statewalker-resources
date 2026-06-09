import type { Project } from "@statewalker/resources-workspace";
import { newAdapter } from "@statewalker/shared-adapters";
import type { LlmApi, WikiLlmConfiguration } from "../../llm/index.js";
import type { Answer, EvidenceSection, QueryProgress } from "../progress.js";

/**
 * Shared process context for the query FSM, accessed via typed `newAdapter`s.
 *
 * FSM events carry no payload, so EVERY datum that crosses a state boundary
 * flows through these adapters. Launch-time resources are injected with their
 * setters; produced values are `set` by the producing state before it yields.
 * Read-only adapters (no create factory) THROW when read before being set — the
 * loud guardrail for "a Trigger forgot to `set` before it `yield`ed".
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

// ── injected once at launch (get throws if unset — no create factory) ──
export const [getProject, setProject] = newAdapter<Project>("wiki:project");
export const [getLlm, setLlm] = newAdapter<LlmApi>("wiki:llm");
export const [getConfig, setConfig] = newAdapter<WikiLlmConfiguration>("wiki:config");
export const [getRequest, setRequest] = newAdapter<QueryRequest>("wiki:request");
export const [getProgress, setProgress] = newAdapter<QueryProgress>("wiki:progress");

// ── produced by a stage, consumed by later stages (set before yield) ──
export const [getIntent, setIntent] = newAdapter<IntentResult>("wiki:intent");
/** The deduped, scored candidate pool (set by Retrieve; consumed by SelectSections). */
export const [getCandidates, setCandidates] = newAdapter<Candidate[]>("wiki:candidates");
/** Next score-tier index SelectSections will consume (0 = both front-ends, then 1 = the rest). */
export const [getTier, setTier] = newAdapter<number>("wiki:tier");
/** The selected-section union so far, accumulated across tiers (drives topics + citation verify). */
export const [getEvidence, setEvidence] = newAdapter<EvidenceSection[]>("wiki:evidence");
/** THIS tier's newly-selected sections grouped by subject (set by SelectSections; folded by Summarize). */
export const [getGroups, setGroups] = newAdapter<SubjectGroup[]>("wiki:groups");
export const [getSummaries, setSummaries] = newAdapter<Summary[]>("wiki:summaries");
export const [getAnswer, setAnswer] = newAdapter<Answer>("wiki:answer");

// ── FSM control, bound onto the context by startProcess ──
export const [getTerminate] = newAdapter<() => Promise<void>>("fsm:terminate");
