## Why

The query FSM passes every per-query datum (request, intent, candidates, evidence, summaries, answer, …) through stringly-keyed `newAdapter` accessors on a `Record<string, unknown>` context. This is untyped indirection for a fixed, well-known set of fields, and it duplicates project-global state onto the context: `run.ts` copies the LLM and wiki config — which are already project adapters (`llmOf` / `wikiConfigOf`) — into context adapters at launch. We work with one concrete pipeline; the context shape should be a typed object, and project-global capabilities should be reached through the project, not copied.

## What Changes

- Introduce a typed `QueryContext` class (in `query/fsm/query-context.ts`) holding the per-query state: constructor-injected `project` / `request` / `progress`, and per-query data in private, default-initialized fields.
- Stages read/write per-query data through **semantic methods** (`setIntent`, `setCandidates`, `addEvidence`, `addSummaries`, `advanceTier`, `setGroups`, `setAnswer`, plus getters) instead of `get*`/`set*` adapter functions. `addEvidence` folds in the `progress.evidence` update so the observable stays in sync.
- **BREAKING (internal):** remove the `wiki:*` context adapters from `context.ts` (`getProject/setProject`, `getRequest`, `getProgress`, `getIntent`, `getCandidates`, `getTier`, `getEvidence`, `getGroups`, `getSummaries`, `getAnswer`, and `getLlm/setLlm`, `getConfig/setConfig`). The shared domain interfaces (`QueryRequest`, `Subject`, `IntentResult`, `Summary`, `SubjectGroup`, `Candidate`) are kept (moved alongside the class).
- `run.ts` stops copying LLM/config onto the context; handlers obtain them via `llmOf(ctx.project)` / `wikiConfigOf(ctx.project)`.
- `Ctx` (`= Record<string, unknown>`) in `query-fsm.ts` is replaced by `QueryContext`; `StageHandler<QueryContext>` flows through `load.ts`, `handlers.ts`, `retrieval.ts`, `run.ts`.
- The FSM engine's own `fsm:*` adapters are left untouched; `guarded()` keeps reading `fsm:terminate` via the framework accessor, casting `ctx` at that one call site.

No change to query behavior, FSM topology, prompts, or observable `QueryProgress` output — this is a context-shape refactor.

## Capabilities

### New Capabilities
- `query-context`: the typed per-query context object for the query FSM — the fields it carries, how stages read/write them via semantic methods, and the boundary between per-query state (on the context) and project-global capabilities (reached via project adapters).

### Modified Capabilities
<!-- None: this package has no archived specs; query behavior/topology is unchanged. -->

## Impact

- **Code (resources-wiki):** `query/fsm/context.ts` (replaced by `query-context.ts`), `query/fsm/query-fsm.ts` (`Ctx` → `QueryContext`), `query/fsm/run.ts`, `query/fsm/load.ts`, `query/fsm/handlers.ts`, `query/fsm/retrieval.ts`; any tests referencing the `wiki:*` adapters.
- **Unchanged dependencies:** `LlmProjectAdapter` (`llmOf`) and `WikiLlmConfiguration` (`wikiConfigOf`) keep their current shape and remain project adapters; an optional rename to `WikiConfigAdapter` is explicitly out of scope.
- **Framework:** `@statewalker/fsm` `startProcess<QueryContext>` casts the context internally, so no index signature is required on the class and the `fsm:*` adapters keep working.
- **No external API impact:** `runQuery(project, question)` signature and `QueryProgress` output are unchanged.
