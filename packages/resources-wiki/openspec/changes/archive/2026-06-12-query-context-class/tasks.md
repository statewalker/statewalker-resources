## 1. QueryContext class

- [x] 1.1 Create `query/fsm/query-context.ts`; move the domain interfaces (`QueryRequest`, `Subject`, `IntentResult`, `Summary`, `SubjectGroup`, `Candidate`) here unchanged.
- [x] 1.2 Define `QueryContext` with constructor-injected readonly `project: Project`, `request: QueryRequest`, `progress: QueryProgress`.
- [x] 1.3 Add private, default-initialized per-query fields: `intent`, `candidates`, `tier = 0`, `evidence: [] `, `groups`, `summaries`, `answer`.
- [x] 1.4 Add semantic methods: `setIntent`, `setCandidates`, `setGroups`, `setSummaries`/`addSummaries`, `setAnswer`, `advanceTier` (+ tier accessor), and getters for each consumed field.
- [x] 1.5 Add `addEvidence(sections)` that unions into document-ordered accumulated evidence AND updates `ctx.progress.evidence` in the same call.

## 2. Repoint the runner and types

- [x] 2.1 In `query-fsm.ts`, replace `Ctx = Record<string, unknown>` with `QueryContext`; update `QueryHandler` to `StageHandler<QueryContext>`.
- [x] 2.2 In `run.ts`, construct `QueryContext` with project/request/progress only; remove `setLlm`/`setConfig`/`setProject`/`setRequest`/`setProgress` calls and the `llmOf`/`wikiConfigOf` launch-time copies.
- [x] 2.3 Pass the `QueryContext` instance as `startProcess<QueryContext>(ctx, …)`.

## 3. Repoint handlers

- [x] 3.1 In `handlers.ts`, replace `getProject/getRequest/getProgress` reads with `ctx.project` / `ctx.request` / `ctx.progress`.
- [x] 3.2 Replace `getLlm(ctx)` / `getConfig(ctx)` with `llmOf(ctx.project)` / `wikiConfigOf(ctx.project)`.
- [x] 3.3 Replace per-query `get*`/`set*` adapter calls with the `QueryContext` semantic methods/getters (intent, candidates, tier, evidence, groups, summaries, answer); fold the standalone `progress.evidence` write into `addEvidence`.
- [x] 3.4 In `retrieval.ts`, repoint any context access to `QueryContext` (project reads, etc.).

## 4. Framework control + cleanup

- [x] 4.1 In `load.ts`, keep reading `fsm:terminate` via the framework accessor in `guarded()`, casting `ctx` to the framework record type at that call site; update `instrument`/`guarded` typing to `QueryContext`.
- [x] 4.2 Delete the `wiki:*` adapters from `context.ts` and remove the file (or reduce it to re-exports if anything external still imports the interfaces); update all imports to `query-context.ts`.
- [x] 4.3 Sweep the package for stale `wiki:*` / `get*`/`set*` adapter references (incl. tests) and repoint them.

## 5. Verify

- [x] 5.1 Run the query FSM tests (incl. `tests/fsm/query-fsm.validate.test.ts`) and the pipeline tests; confirm behavior and `QueryProgress` output unchanged.
- [x] 5.2 `pnpm tsc --noEmit` clean (no index signature needed on `QueryContext`).
- [x] 5.3 `pnpm biome check --write --unsafe` clean.
