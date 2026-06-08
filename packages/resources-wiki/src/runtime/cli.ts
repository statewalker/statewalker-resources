import { createDefaultRegistry } from "@statewalker/content-extractors";
import {
  type Adaptable,
  type FilesApi,
  LoggerAdapter,
  type LoggerLevel,
  ResourceRepository,
  Workspace,
} from "@statewalker/resources-workspace";
import { WikiQuery } from "../query/index.js";
import { PinoLoggerAdapter } from "./logger.js";
import { resolveProvidersFromEnv } from "./providers.js";
import { registerWiki, type WikiDeps, wireWikiProject } from "./register-wiki.js";

const LOG_LEVELS: readonly LoggerLevel[] = ["fatal", "error", "warn", "info", "debug", "trace"];

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

export interface CliDeps {
  filesApi: FilesApi;
  env: Record<string, string | undefined>;
  log?: (msg: string) => void;
}

const USAGE =
  "usage: wiki <root> <scan|status|query|restart> <project> [question|builder|force] [--log-level <fatal|error|warn|info|debug|trace>]";

/**
 * Drive the wiki over a `Workspace`/`Project` for a vault `FilesApi`:
 *   scan  <project>            — run the build pipeline
 *   status <project>           — per-builder pending counts
 *   query <project> <question> — routed, cited answer
 *   restart <project> <builder>— reset a builder + its downstream
 */
export async function runWikiCli(args: string[], deps: CliDeps): Promise<void> {
  const log = deps.log ?? ((m: string) => process.stdout.write(`${m}\n`));
  // Log level is a CLI flag (default `info`); strip it before positional parsing.
  const { level: logLevel, args: positional } = extractLogLevel(args);
  const [command, projectKey, ...rest] = positional;
  if (!command || !projectKey) {
    log(USAGE);
    return;
  }

  const providers = resolveProvidersFromEnv(deps.env);
  // `scan <project> force` re-runs every stage even when the source hash is unchanged.
  const wikiDeps: WikiDeps = {
    ...providers,
    extractors: createDefaultRegistry(),
    force: rest.includes("force"),
  };
  const repository = new ResourceRepository({ filesApi: deps.filesApi });
  // Stage logging: pino-backed loggers at the chosen level, available to every
  // resource as `requireAdapter(LoggerAdapter).newLogger(key)`.
  repository.register(
    "",
    LoggerAdapter,
    (a: Adaptable) => new PinoLoggerAdapter(a, { level: logLevel }),
  );
  registerWiki(repository, wikiDeps);
  const workspace = repository.requireAdapter<Workspace>(Workspace);
  const project =
    command === "scan"
      ? await workspace.getProject(projectKey, true)
      : await workspace.getProject(projectKey, false);
  if (!project) {
    log(`project not found: ${projectKey}`);
    return;
  }

  switch (command) {
    case "scan": {
      const builder = wireWikiProject(project, wikiDeps);
      for await (const stage of builder.run()) {
        if (stage.type === "call") {
          log(`  ${stage.builderId}: ${stage.result ? "ok" : "interrupted"}`);
        }
      }
      log("scan complete");
      break;
    }
    case "status": {
      const builder = wireWikiProject(project, wikiDeps);
      const status = await builder.status();
      for (const b of status.builders) {
        log(`  ${b.id}: pending=${b.pending} tx=${b.lastTransaction}`);
      }
      break;
    }
    case "query": {
      const answer = await project.requireAdapter(WikiQuery).ask(rest.join(" ")).complete();
      log(answer.text);
      for (const c of answer.caveats) log(`  caveat: ${c}`);
      break;
    }
    case "restart": {
      const builder = wireWikiProject(project, wikiDeps);
      await builder.restartFrom(rest[0] ?? "");
      log(`restarted from ${rest[0]}`);
      break;
    }
    default:
      log(`unknown command: ${command}\n${USAGE}`);
  }
}
