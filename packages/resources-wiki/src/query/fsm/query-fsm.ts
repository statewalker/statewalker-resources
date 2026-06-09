import type { FsmStateConfig, StageHandler } from "@statewalker/fsm";

/** The flat process context object (typed access is via the `wiki:*` adapters). */
export type Ctx = Record<string, unknown>;

/** A query-pipeline state handler: a one-shot Trigger yielding one event. */
export type QueryHandler = StageHandler<Ctx>;

/**
 * Every state key in the query FSM. The handler `load` map is keyed by this
 * union so the compiler guarantees exhaustive coverage — a missing handler is
 * a type error, never a silent runtime no-op.
 */
export type QueryStateKey =
  | "Query"
  | "IntentDetection"
  | "Retrieve"
  | "ChapterPlan"
  | "Summarize"
  | "Respond"
  | "Verify"
  | "Response"
  | "NegativeResponse";

/**
 * The query pipeline as a flat Finite State Machine.
 *
 * `IntentDetection → Retrieve → ChapterPlan → Summarize → Respond → Verify →
 * Response`, with `NegativeResponse` reachable from `IntentDetection` (off-corpus)
 * and `Retrieve` (no evidence).
 *
 * Retrieval runs two front-ends in parallel inside the `Retrieve` handler — the
 * mechanical hybrid (FTS + vector) search and the LLM topic/doc-topic class
 * ladder — merged into one evidence pool; the per-subject fan-out is
 * handler-internal so the topology is fixed regardless of subject count. There
 * is a single pipeline, so no pluggable `Route`/`Pipelines` composite.
 *
 * Validated by `@statewalker/fsm-validator` (0 errors / 0 warnings) — see
 * `tests/fsm/query-fsm.validate.test.ts`.
 */
export const QUERY_FSM: FsmStateConfig = {
  key: "Query",
  description:
    "Answer a question against the project's LLM-curated wiki via an FSM-driven retrieval pipeline.",
  transitions: [
    ["", "*", "IntentDetection"],
    ["IntentDetection", "onCorpus", "Retrieve"],
    ["IntentDetection", "offCorpus", "NegativeResponse"],
    ["Retrieve", "gathered", "ChapterPlan"],
    ["Retrieve", "empty", "NegativeResponse"],
    ["ChapterPlan", "planned", "Summarize"],
    ["Summarize", "summarized", "Respond"],
    ["Respond", "answered", "Verify"],
    ["Verify", "verified", "Response"],
    ["Response", "done", ""],
    ["NegativeResponse", "done", ""],
  ],
  states: [
    {
      key: "IntentDetection",
      description: "Classify on/off-corpus and decompose the prompt into distinct search subjects.",
      events: {
        onCorpus: "The prompt concerns the vault's domain.",
        offCorpus: "The prompt is out of scope.",
      },
    },
    {
      key: "Retrieve",
      description:
        "Per subject, run hybrid search and the topic/doc-topic class ladder; merge into one evidence pool.",
      events: {
        gathered: "At least one evidence section was retrieved.",
        empty: "No relevant evidence anywhere.",
      },
    },
    {
      key: "ChapterPlan",
      description: "Deduplicate and document-order the referenced chapters.",
      events: { planned: "Chapter plan built." },
    },
    {
      key: "Summarize",
      description:
        "Window-bounded rolling summarization; each fold exposes the section's raw content.",
      events: { summarized: "Rolling summaries produced." },
    },
    {
      key: "Respond",
      description: "Compose the grounded, cited answer from the rolling summaries.",
      events: { answered: "Answer composed with chapter citations." },
    },
    {
      key: "Verify",
      description: "Mechanically keep only citations that resolve to retrieved evidence.",
      events: { verified: "Citations verified." },
    },
    {
      key: "Response",
      description: "Publish the cited answer.",
      events: { done: "Answer published." },
    },
    {
      key: "NegativeResponse",
      description: "Publish a no-evidence / off-corpus answer.",
      events: { done: "Negative response published." },
    },
  ],
};
