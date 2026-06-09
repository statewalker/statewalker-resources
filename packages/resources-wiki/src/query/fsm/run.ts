import { startProcess } from "@statewalker/fsm";
import type { Project } from "@statewalker/resources-workspace";
import { llmOf, wikiConfigOf } from "../../llm/index.js";
import { QueryProgress } from "../progress.js";
import { setConfig, setLlm, setProgress, setProject, setRequest } from "./context.js";
import { load } from "./load.js";
import { type Ctx, QUERY_FSM } from "./query-fsm.js";

/**
 * Drive the query pipeline as an FSM. Builds the flat process context, injects the
 * launch-time adapters (project + the `llmOf` / `wikiConfigOf` project adapters),
 * and runs `QUERY_FSM` via `startProcess`. The state handlers own the stage logic.
 *
 * Returns a `QueryProgress` synchronously; transitions proceed asynchronously and
 * the result surfaces on it (await `progress.complete()`).
 */
export function runQuery(project: Project, question: string): QueryProgress {
  const progress = new QueryProgress();
  const ctx: Ctx = {};
  setProject(ctx, project);
  setLlm(ctx, llmOf(project));
  setConfig(ctx, wikiConfigOf(project));
  setRequest(ctx, { question });
  setProgress(ctx, progress);
  startProcess(ctx, QUERY_FSM, load, "").catch((err) => progress._fail(err));
  return progress;
}
