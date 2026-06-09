import {
  Project,
  ResourceAdapter,
  type ResourceRepository,
} from "@statewalker/resources-workspace";
import { runQuery } from "./fsm/run.js";
import type { QueryProgress } from "./progress.js";

export type { Answer, AnswerTopic, EvidenceSection } from "./progress.js";
export { QueryProgress } from "./progress.js";

/**
 * Routed question answering on a project's wiki. `ask` returns a `QueryProgress`
 * synchronously and fills it asynchronously by driving the query FSM
 * (`IntentDetection → Retrieve → SelectSections → Summarize → Respond → Verify →
 * Response | NegativeResponse`) — see `./fsm/`. Models come from the project
 * adapters (`llmOf` / `wikiConfigOf`); no model deps are injected here.
 */
export class WikiQuery extends ResourceAdapter {
  private get project(): Project {
    return this.resource.requireAdapter<Project>(Project);
  }

  ask(question: string): QueryProgress {
    return runQuery(this.project, question);
  }
}

/** Register `WikiQuery` (project-level). */
export function registerQuery(repository: ResourceRepository): () => void {
  return repository.register("", WikiQuery);
}
