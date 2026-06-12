import { createDefaultRegistry } from "@statewalker/content-extractors";
import {
  type Adaptable,
  type FilesApi,
  LoggerAdapter,
  type LoggerLevel,
  ResourceRepository,
  Workspace,
} from "@statewalker/resources-workspace";
import { stringify as stringifyYaml } from "yaml";
import { costOf, roundUsd } from "../llm/index.js";
import type { Answer } from "../query/index.js";
import { type QueryProgress, WikiQuery } from "../query/index.js";
import { PinoLoggerAdapter } from "./logger.js";
import { resolveProvidersFromEnv } from "./providers.js";
import { registerWiki, type WikiDeps, wireWikiProject } from "./register-wiki.js";

const LOG_LEVELS: readonly LoggerLevel[] = ["fatal", "error", "warn", "info", "debug", "trace"];

/** Output serialization for the data channel. `none` = emit nothing (progress only). */
export type OutputFormat = "none" | "json" | "yaml";
const OUTPUT_FORMATS: readonly OutputFormat[] = ["none", "json", "yaml"];

/**
 * Pull a `--log-level <level>` / `--log-level=<level>` (or `-l`) flag out of the
 * argument list. Defaults to `info`; an unknown level falls back to `info`.
 */
function extractLogLevel(args: string[]): { level: LoggerLevel; args: string[] } {
  const coerce = (v: string): LoggerLevel =>
    LOG_LEVELS.includes(v as LoggerLevel) ? (v as LoggerLevel) : "info";
  let level: LoggerLevel = "info";
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const inline = a.match(/^--log-level=(.+)$/);
    if (inline) {
      level = coerce(inline[1]);
    } else if (a === "--log-level" || a === "-l") {
      const v = args[++i];
      if (v !== undefined) level = coerce(v);
    } else {
      rest.push(a);
    }
  }
  return { level, args: rest };
}

/**
 * Pull a `--format <none|json|yaml>` / `--format=<…>` (or `-f`) flag out of the
 * argument list. Returns `undefined` when absent so the caller's default applies.
 */
function extractFormat(args: string[]): { format?: OutputFormat; args: string[] } {
  const coerce = (v: string): OutputFormat | undefined =>
    OUTPUT_FORMATS.includes(v as OutputFormat) ? (v as OutputFormat) : undefined;
  let format: OutputFormat | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const inline = a.match(/^--format=(.+)$/);
    if (inline) {
      format = coerce(inline[1]);
    } else if (a === "--format" || a === "-f") {
      const v = args[++i];
      if (v !== undefined) format = coerce(v);
    } else {
      rest.push(a);
    }
  }
  return { format, args: rest };
}

/** Minimal sink the CLI writes its data channel to (e.g. `process.stdout`). */
export interface OutputStream {
  write(chunk: string): unknown;
}

export interface CliDeps {
  filesApi: FilesApi;
  env: Record<string, string | undefined>;
  /**
   * Data channel, ObservableHQ-data-loader style. Each command's structured
   * result is serialized here as a single document. The caller wires this to the
   * real output stream (the binary maps it to `process.stdout`). When omitted,
   * no data is emitted at all — only progress notifications on `warn`.
   */
  out?: OutputStream;
  /**
   * Serialization for the data channel. Defaults to `json`; `none` suppresses
   * the data channel entirely (progress only), as does omitting `out`. A
   * `--format` CLI flag overrides this.
   */
  format?: OutputFormat;
  /**
   * Diagnostics channel for progress, status and stats — everything that is NOT
   * the command's data. Keeping it off `out` leaves the data channel clean.
   * When omitted it is wired to the run logger (which writes to stderr), so
   * diagnostics never pollute the default output stream either way.
   */
  warn?: (message: string) => void;
  /** Clock for the `createdAt` stamp on query results. Defaults to the wall clock. */
  clock?: () => string;
}

const USAGE =
  "usage: wiki <root> <scan|status|query|restart|invalidate> <project> [question|builder|stage…|force] [--format <none|json|yaml>] [--log-level <fatal|error|warn|info|debug|trace>]";

/**
 * Map the query engine's `Answer` onto the shared wiki answer shape used across
 * the toolchain (matches `answerToYaml`): `question, createdAt, text, topics,
 * outliers, inconsistencies, suggestions, caveats`, with per-class
 * `citations: [{uri}]`. `inconsistencies` is always `[]` here — this engine does
 * not surface them yet.
 */
function answerToResult(
  answer: Answer,
  meta: { question: string; createdAt: string },
): Record<string, unknown> {
  const classOut = (c: Answer["topics"][number]) => ({
    key: c.key,
    name: c.name,
    description: c.description ?? "",
    citations: c.citations.map((ref) => ({ uri: ref.uri })),
  });
  return {
    question: meta.question,
    createdAt: meta.createdAt,
    text: answer.text,
    topics: answer.topics.map(classOut),
    outliers: answer.outliers.map(classOut),
    inconsistencies: [],
    suggestions: answer.suggestions,
    caveats: answer.caveats,
  };
}

/** Per-model / per-stage / total run stats — emitted to the diagnostics channel. */
function reportStats(progress: QueryProgress, warn: (m: string) => void): void {
  const byModel = new Map<string, { calls: number; in: number; out: number; ms: number }>();
  for (const c of progress.llmCalls) {
    const m = byModel.get(c.model) ?? { calls: 0, in: 0, out: 0, ms: 0 };
    m.calls += 1;
    m.in += c.inputTokens;
    m.out += c.outputTokens;
    m.ms += c.ms;
    byModel.set(c.model, m);
  }
  const stageMs = new Map<string, number>();
  for (const s of progress.stages) {
    stageMs.set(s.name, (stageMs.get(s.name) ?? 0) + (s.ms ?? 0));
  }
  let totIn = 0;
  let totOut = 0;
  let totInUsd = 0;
  let totOutUsd = 0;
  let totCallMs = 0;
  warn("");
  warn("stats — by model:");
  for (const [model, m] of byModel) {
    const cost = costOf(model, { inputTokens: m.in, outputTokens: m.out });
    totIn += m.in;
    totOut += m.out;
    totInUsd += cost.inputUsd;
    totOutUsd += cost.outputUsd;
    totCallMs += m.ms;
    warn(
      `  ${model}: ${m.calls} call(s), ${m.in} in / ${m.out} out tok, ` +
        `$${roundUsd(cost.inputUsd)} / $${roundUsd(cost.outputUsd)} / $${roundUsd(cost.totalUsd)}, ${m.ms} ms`,
    );
  }
  warn("stats — time by stage:");
  for (const [name, ms] of stageMs) warn(`  ${name}: ${ms} ms`);
  warn("stats — total:");
  warn(`  tokens: ${totIn} in / ${totOut} out`);
  warn(
    `  cost: $${roundUsd(totInUsd)} in / $${roundUsd(totOutUsd)} out / $${roundUsd(totInUsd + totOutUsd)} total`,
  );
  warn(`  llm call time (cumulative): ${totCallMs} ms`);
  warn(`  total elapsed: ${progress.totalMs} ms`);
}

/**
 * Drive the wiki over a `Workspace`/`Project` for a vault `FilesApi`:
 *   scan  <project>            — run the build pipeline
 *   status <project>           — per-builder pending counts
 *   query <project> <question> — routed, cited answer
 *   restart <project> <builder>— reset a builder + its downstream
 *
 * The structured result of each command is serialized to `deps.out` (JSON or
 * YAML); progress/status/stats go to `deps.warn`. This function never touches
 * `process` — the caller owns both streams.
 */
export async function runWikiCli(args: string[], deps: CliDeps): Promise<void> {
  // Flags are CLI-level; strip them before positional parsing.
  const { level: logLevel, args: afterLevel } = extractLogLevel(args);
  const { format: flagFormat, args: positional } = extractFormat(afterLevel);
  const [command, projectKey, ...rest] = positional;

  const repository = new ResourceRepository({ filesApi: deps.filesApi });
  // Stage logging: pino-backed loggers at the chosen level, pinned to stderr so
  // they never reach the data channel on stdout.
  repository.register(
    "",
    LoggerAdapter,
    (a: Adaptable) => new PinoLoggerAdapter(a, { level: logLevel, destination: 2 }),
  );
  const cliLog = repository.requireAdapter<LoggerAdapter>(LoggerAdapter).newLogger("wiki-cli");
  // Diagnostics sink: the caller's `warn`, or the (stderr-bound) run logger.
  const warn = deps.warn ?? ((m: string) => cliLog.warn(m));

  // Data sink: serialize one document per command. Suppressed when no output
  // stream is wired or the format is `none` — progress still flows to `warn`.
  const format = flagFormat ?? deps.format ?? "json";
  const now = deps.clock ?? (() => new Date().toISOString());
  const emit = (data: unknown): void => {
    if (!deps.out || format === "none") return;
    const doc = format === "yaml" ? stringifyYaml(data) : `${JSON.stringify(data, null, 2)}\n`;
    deps.out.write(doc);
  };

  if (!command || !projectKey) {
    warn(USAGE);
    return;
  }

  const providers = resolveProvidersFromEnv(deps.env);
  // `scan <project> force` re-runs every stage even when the source hash is unchanged.
  const force = rest.includes("force");
  const wikiDeps: WikiDeps = {
    ...providers,
    extractors: createDefaultRegistry(),
  };
  registerWiki(repository, wikiDeps);
  const workspace = repository.requireAdapter<Workspace>(Workspace);
  const project =
    command === "scan"
      ? await workspace.getProject(projectKey, true)
      : await workspace.getProject(projectKey, false);
  if (!project) {
    warn(`project not found: ${projectKey}`);
    emit({ command, project: projectKey, error: "project not found" });
    return;
  }

  switch (command) {
    case "scan": {
      const builder = wireWikiProject(project, { force });
      const builders: { id: string; result: boolean }[] = [];
      for await (const stage of builder.run()) {
        if (stage.type === "call") {
          warn(`  ${stage.builderId}: ${stage.result ? "ok" : "interrupted"}`);
          builders.push({ id: stage.builderId, result: Boolean(stage.result) });
        }
      }
      warn("scan complete");
      emit({ command: "scan", project: projectKey, status: "complete", builders });
      break;
    }
    case "status": {
      const builder = wireWikiProject(project, { force });
      const status = await builder.status();
      for (const b of status.builders) {
        warn(`  ${b.id}: pending=${b.pending} tx=${b.lastTransaction}`);
      }
      emit({
        command: "status",
        project: projectKey,
        builders: status.builders.map((b) => ({
          id: b.id,
          pending: b.pending,
          lastTransaction: b.lastTransaction,
        })),
      });
      break;
    }
    case "query": {
      const question = rest.join(" ");
      const progress = project.requireAdapter(WikiQuery).ask(question);
      // Surface each stage as the FSM advances — to diagnostics only; the data
      // channel stays empty until the final, structured result is ready.
      let announced = 0;
      progress.onChange(() => {
        for (; announced < progress.stages.length; announced++) {
          warn(`  ${progress.stages[announced].name}: running`);
        }
      });
      const answer = await progress.complete();
      reportStats(progress, warn);
      // Data channel: the structured search result in the shared answer shape.
      emit(answerToResult(answer, { question, createdAt: now() }));
      break;
    }
    case "restart": {
      const builder = wireWikiProject(project, { force });
      const from = rest[0] ?? "";
      await builder.restartFrom(from);
      warn(`restarted from ${from}`);
      emit({ command: "restart", project: projectKey, from });
      break;
    }
    case "invalidate": {
      // Reset one or more build stages (and everything downstream): clears their
      // transaction watermarks and handled-input rows so the next `scan` re-runs
      // them. Upstream stages re-emit their outputs on a hash-skip, so this
      // rebuilds derived artifacts (embeddings, indexes) without re-running the
      // LLM stages when the sources are unchanged.
      const builder = wireWikiProject(project, { force });
      const stages = rest.filter((r) => r !== "force");
      if (stages.length === 0) {
        warn("usage: wiki <root> invalidate <project> <stage…>  (e.g. Summarizer, Embedder)");
        emit({ command: "invalidate", project: projectKey, invalidated: [], error: "no stages" });
        break;
      }
      for (const stage of stages) {
        await builder.restartFrom(stage);
        warn(`invalidated ${stage} (and its downstream stages)`);
      }
      warn("run `scan` to rebuild the invalidated stages");
      emit({ command: "invalidate", project: projectKey, invalidated: stages });
      break;
    }
    default:
      warn(`unknown command: ${command}\n${USAGE}`);
      emit({ command, error: "unknown command" });
  }
}
