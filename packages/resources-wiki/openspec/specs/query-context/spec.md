## Purpose

Defines the typed per-query context object for the query FSM — the fields it carries, how stages read and write them via semantic methods, and the boundary between per-query state (held on the context) and project-global capabilities (reached via project adapters).

## Requirements

### Requirement: Typed query context object

The query FSM SHALL drive its pipeline with a typed `QueryContext` class instance as the process context, replacing the `Record<string, unknown>` context accessed via `wiki:*` `newAdapter` accessors. The class SHALL be the single carrier of per-query state across FSM state boundaries.

#### Scenario: Context constructed at launch

- **WHEN** `runQuery(project, question)` starts the pipeline
- **THEN** it constructs a `QueryContext` with the `project`, the `QueryRequest` (`{ question }`), and the `QueryProgress`
- **AND** passes that instance as the context to `startProcess`

#### Scenario: No per-query data adapters remain

- **WHEN** the query FSM source is inspected
- **THEN** no `wiki:*` `newAdapter` accessor exists for per-query data (request, progress, intent, candidates, tier, evidence, groups, summaries, answer) nor for project/llm/config
- **AND** handlers reference that data only through the `QueryContext` instance

### Requirement: Launch-time fields exposed directly

`QueryContext` SHALL expose `project`, `request`, and `progress` as constructor-injected readonly fields. Handlers SHALL read them directly (e.g. `ctx.project`).

#### Scenario: Handler reads launch-time fields

- **WHEN** a handler needs the project, the request, or the progress sink
- **THEN** it reads `ctx.project` / `ctx.request` / `ctx.progress` with no accessor function call and no throw

### Requirement: Per-query data via semantic methods

`QueryContext` SHALL keep per-query data (intent, candidates, tier, evidence, groups, summaries, answer) in private, default-initialized fields, and SHALL expose semantic methods for stages to read and write them. Producing a value SHALL go through a named method rather than direct field assignment; accumulating values SHALL go through methods that encode the accumulation.

#### Scenario: One-shot products are set, then read

- **WHEN** the `IntentDetection` stage completes
- **THEN** it calls `ctx.setIntent(result)`
- **AND** a later stage reads it via a getter (e.g. `ctx.intent`)

#### Scenario: Evidence accumulates across tiers

- **WHEN** the `SelectSections` stage adds a tier's selected sections
- **THEN** it calls `ctx.addEvidence(sections)` which unions them into the accumulated, document-ordered evidence
- **AND** the same call keeps `ctx.progress.evidence` in sync with the accumulated evidence

#### Scenario: Tier advances by method

- **WHEN** `SelectSections` consumes the current retrieval tier
- **THEN** it advances the tier through a `QueryContext` method (e.g. `advanceTier`) rather than read-modify-write of a raw field

#### Scenario: Default-initialized fields are read before their producer runs

- **WHEN** a per-query field is read before the stage that produces it has run
- **THEN** the read returns that field's default (empty collection / sentinel) and does NOT throw

### Requirement: Project-global capabilities reached via project adapters

Handlers SHALL obtain project-global capabilities — the LLM and the wiki configuration — through the project, not through the context. The context SHALL NOT carry copies of the LLM or the configuration.

#### Scenario: Handler obtains the LLM

- **WHEN** a handler needs the LLM
- **THEN** it calls `llmOf(ctx.project)` (which resolves `project.requireAdapter(LlmProjectAdapter)`)

#### Scenario: Handler obtains the wiki configuration

- **WHEN** a handler needs per-stage model names or other wiki configuration
- **THEN** it calls `wikiConfigOf(ctx.project)` (which resolves `project.requireAdapter(WikiLlmConfiguration)`)

#### Scenario: Launch does not copy project-global state

- **WHEN** `runQuery` builds the context
- **THEN** it does not set any LLM or configuration value onto the context

### Requirement: Declarative termination on stage failure

`QueryContext` SHALL hold no FSM-engine control adapter; it carries only domain state. Termination on a stage failure SHALL be declarative — driven by a wildcard `["*", "error", ""]` transition in the FSM topology rather than an imperative engine `terminate` call. `QueryContext` SHALL NOT require an index signature, and the framework SHALL still be able to write its `fsm:*` keys onto the instance.

#### Scenario: A thrown stage terminates the process

- **WHEN** a stage handler throws (network/schema failure)
- **THEN** the guarding wrapper records the failure on `QueryProgress` (rejecting `complete()`) and yields the `error` event
- **AND** the `["*", "error", ""]` transition exits all sub-states and ends the process, with no imperative `fsm:terminate` call

#### Scenario: Behavior and output unchanged

- **WHEN** the refactored pipeline answers a query
- **THEN** the FSM topology, prompts, stage sequence, and emitted `QueryProgress` output are identical to before the change
