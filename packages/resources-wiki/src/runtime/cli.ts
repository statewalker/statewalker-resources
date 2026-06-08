import { createDefaultRegistry } from "@statewalker/content-extractors";
import { type FilesApi, ResourceRepository, Workspace } from "@statewalker/resources-workspace";
import { WikiQuery } from "../query/index.js";
import { resolveProvidersFromEnv } from "./providers.js";
import { registerWiki, type WikiDeps, wireWikiProject } from "./register-wiki.js";

export interface CliDeps {
  filesApi: FilesApi;
  env: Record<string, string | undefined>;
  log?: (msg: string) => void;
}

const USAGE = "usage: wiki <root> <scan|status|query|restart> <project> [question|builder|force]";

/**
 * Drive the wiki over a `Workspace`/`Project` for a vault `FilesApi`:
 *   scan  <project>            — run the build pipeline
 *   status <project>           — per-builder pending counts
 *   query <project> <question> — routed, cited answer
 *   restart <project> <builder>— reset a builder + its downstream
 */
export async function runWikiCli(args: string[], deps: CliDeps): Promise<void> {
  const log = deps.log ?? ((m: string) => process.stdout.write(`${m}\n`));
  const [command, projectKey, ...rest] = args;
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
