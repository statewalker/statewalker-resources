## Context

The query pipeline (`src/query/fsm`) runs as a flat FSM via `@statewalker/fsm`'s `startProcess`. FSM events carry no payload, so every datum crossing a state boundary flows through a shared process context. Today that context is `Record<string, unknown>` and every field is reached through a stringly-keyed `newAdapter` accessor declared in `context.ts` (`getIntent`/`setIntent`, …). Two facts shape this change:

- `llmOf` and `wikiConfigOf` are **already** project adapters (`project.requireAdapter(LlmProjectAdapter)` / `requireAdapter(WikiLlmConfiguration)`). `run.ts` redundantly copies their results into `wiki:llm` / `wiki:config` context adapters at launch.
- `startProcess<C>` is generic over the context type and casts to `Record<string, unknown>` internally before writing its own `fsm:states` / `fsm:event` / `fsm:dispatch` / `fsm:terminate` keys. A typed class instance works as the context with no index signature.

We work with one concrete pipeline whose field set is fixed and known. The untyped adapter indirection buys nothing here, and the LLM/config copy duplicates state already reachable from the project.

## Goals / Non-Goals

**Goals:**

- Replace the per-query `wiki:*` context adapters with a typed `QueryContext` class.
- Per-query data lives in private fields; stages read/write via semantic methods.
- Project-global capabilities (LLM, wiki config) are reached through `ctx.project` via the existing `llmOf` / `wikiConfigOf` helpers; nothing project-global is copied onto the context.
- Preserve query behavior, FSM topology, prompts, and `QueryProgress` output exactly.

**Non-Goals:**

- No change to query behavior, retrieval strategy, prompts, scoring, or the observable result shape.
- No change to the FSM engine or its `fsm:*` adapters.
- No rename of `WikiLlmConfiguration` to `WikiConfigAdapter` (explicitly deferred).
- No throw-on-early-read guardrail — superseded by default-initialized fields (see Decisions).

## Decisions

### `QueryContext` is a class with private fields + semantic methods

Constructor injects `project: Project`, `request: QueryRequest`, `progress: QueryProgress` (public readonly). Per-query data is private and default-initialized. Stages mutate via named methods that encode pipeline semantics:

- `setIntent(v)`, `setCandidates(pool)`, `setGroups(g)`, `setAnswer(a)` — one-shot products.
- `addEvidence(sections)` — unions into the accumulated, document-ordered evidence **and** updates `progress.evidence` in the same call (folds in today's `handlers.ts` line that does this separately).
- `addSummaries(s)` — appends to the rolling summary list.
- `advanceTier()` / tier accessor — advances the retrieval tier instead of read-modify-write of a raw field.
- Getters expose current values for consumers.

*Why a class over a plain typed object + free `require*` functions:* the user's target is a single cohesive `QueryContext` whose methods name the pipeline's operations, keeping accumulation logic (union/dedup, tier advance, progress sync) in one place rather than scattered across handlers. *Alternative considered:* plain interface with optional fields and `require*` accessors that throw on early read — rejected in favor of default-initialized fields (below).

### All per-query fields default-initialized; no early-read guardrail

Every per-query field has a default (`[]`, `0`, sentinel). A read before the producing stage returns the default rather than throwing. *Why:* the FSM is linear and ordered, so premature reads are unlikely; default-init yields the simplest class and removes the per-field guard machinery. *Trade-off:* loses the "loud throw" that the old read-only adapters gave — accepted deliberately (see Risks).

### Project-global capabilities stay off the context

`run.ts` constructs the context with only `project` / `request` / `progress`. Handlers that need the LLM or config call `llmOf(ctx.project)` / `wikiConfigOf(ctx.project)`. The `getLlm`/`setLlm`/`getConfig`/`setConfig` adapters and their launch-time copies are deleted. *Why:* these are project adapters already; copying them onto the context was redundant and is the indirection this change targets.

### FSM engine adapters left untouched; cast at the one terminate site

The `fsm:*` adapters remain. `QueryContext` is passed as `startProcess<QueryContext>(ctx, …)`; the engine casts internally, so the class needs no index signature and full typo-protection is retained on the typed fields. `guarded()` keeps reading `fsm:terminate` via the framework accessor, casting `ctx` to the framework record type at that single call site. *Alternative considered:* thread the `ProcessHandle.shutdown` returned by `startProcess` into the handlers — rejected because `load` (which builds the guarded handlers) is passed *into* `startProcess` before the handle exists, so threading it adds a mutable holder for no real gain.

### Domain interfaces kept, moved alongside the class

`QueryRequest`, `Subject`, `IntentResult`, `Summary`, `SubjectGroup`, `Candidate` are unchanged and move into `query-context.ts` (or a sibling types file) so consumers import them from one place. `query-fsm.ts`'s `Ctx = Record<string, unknown>` alias is replaced by `QueryContext`; `StageHandler<QueryContext>` flows through `load.ts`, `handlers.ts`, `retrieval.ts`, `run.ts`.

## Risks / Trade-offs

- **Lost early-read guardrail** → mitigated by the linear, validated FSM order (a stage only reads what an earlier stage produced) and by semantic setters that make the produce-then-consume order explicit at call sites. If a silent-default bug ever surfaces, the affected field can be promoted to a throwing getter without changing the public method surface.
- **Class instance as FSM context could surprise the engine** → mitigated: `startProcess<C>` casts to a record and only writes string keys; verified against `start-process.ts`. Covered by the existing FSM validation test and the behavior-unchanged scenario.
- **Wide mechanical diff across handlers** → mitigated by keeping method names close to the old `set*` names and changing only the access mechanism, not the logic; the full pipeline test suite guards behavior.
- **Hidden adapter references in tests** → the migration includes a sweep for `wiki:*` / `get*`/`set*` imports so none are left dangling.

## Migration Plan

1. Add `query-context.ts` with `QueryContext` and the moved domain interfaces.
2. Repoint `run.ts` to construct `QueryContext` with project/request/progress only; drop the LLM/config copy.
3. Replace `Ctx` with `QueryContext` in `query-fsm.ts`; update `StageHandler` typing.
4. Repoint `handlers.ts` and `retrieval.ts` to context methods and `llmOf(ctx.project)` / `wikiConfigOf(ctx.project)`.
5. Update `load.ts` (`guarded` casts at the `fsm:terminate` read).
6. Delete `context.ts` adapters; sweep tests for stale adapter references.
7. Run tests → typecheck → lint; confirm behavior and `QueryProgress` output unchanged.

No runtime data migration; rollback is reverting the change set.
