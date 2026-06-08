import {
  type Adaptable,
  concatPath,
  Project,
  ResourceAdapter,
  type ResourceRepository,
} from "@statewalker/resources-workspace";
import type { FilesApi } from "@statewalker/webrun-files";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";
import type { Answer } from "./wiki-query.js";
import { WikiQuery } from "./wiki-query.js";

const DEFAULT_SYSTEM_FOLDER = ".project";

export interface SnapshotInfo {
  id: string;
  kind: "answer" | "report";
  createdAt: string;
  /** Human label — the question for an answer, a title for a report. */
  label?: string;
}
export interface Snapshot extends SnapshotInfo {
  payload: unknown;
}
export interface ReportSpec {
  prompts: string[];
}

interface AdapterOptions extends Record<string, unknown> {
  clock?: () => string;
}

/**
 * Frozen, temporally-versioned saved answers and reports under the project system
 * folder (`<systemFolder>/snapshots/<id>.json`). Snapshots are never auto-updated and
 * never re-ingested as sources; re-running produces a new dated snapshot.
 */
export class WikiSnapshotsAdapter extends ResourceAdapter {
  private counter = 0;

  private get opts(): AdapterOptions {
    return this.options as AdapterOptions;
  }
  private get filesApi(): FilesApi {
    return (this.repository as ResourceRepository).filesApi;
  }
  private get project(): Project {
    return this.resource.requireAdapter<Project>(Project);
  }
  private get systemFolder(): string {
    return (this.repository.options.systemFolder as string | undefined) ?? DEFAULT_SYSTEM_FOLDER;
  }
  private dir(): string {
    return concatPath(this.resource.path.replace(/^\/+|\/+$/g, ""), this.systemFolder, "snapshots");
  }
  private now(): string {
    return this.opts.clock ? this.opts.clock() : new Date().toISOString();
  }
  private newId(): string {
    // Dated + a per-adapter counter so same-instant snapshots stay distinct.
    return `${this.now()}__${this.counter++}`;
  }

  private async store(
    kind: "answer" | "report",
    payload: unknown,
    label?: string,
  ): Promise<string> {
    const id = this.newId();
    const snapshot: Snapshot = { id, kind, createdAt: this.now(), label, payload };
    await writeJsonAtomic(
      this.filesApi,
      concatPath(this.dir(), `${encodeURIComponent(id)}.json`),
      snapshot,
    );
    return id;
  }

  /** Persist an answer as a frozen snapshot, optionally labelled with its question. Returns its id. */
  saveAnswer(answer: Answer, label?: string): Promise<string> {
    return this.store("answer", answer, label);
  }

  /** Run each prompt through `WikiQuery` and persist the answers as a report snapshot. */
  async runReport(spec: ReportSpec, label?: string): Promise<string> {
    const query = this.project.getAdapter(WikiQuery);
    const answers: Answer[] = [];
    if (query) {
      for (const prompt of spec.prompts) {
        answers.push(await query.ask(prompt).complete());
      }
    }
    return this.store("report", { prompts: spec.prompts, answers }, label);
  }

  async *listSnapshots(): AsyncIterable<SnapshotInfo> {
    for await (const info of this.filesApi.list(this.dir(), { recursive: false })) {
      if (info.kind !== "file" || !info.path.endsWith(".json")) continue;
      const snap = await tryReadJson<Snapshot>(this.filesApi, info.path);
      if (snap)
        yield { id: snap.id, kind: snap.kind, createdAt: snap.createdAt, label: snap.label };
    }
  }

  async getSnapshot(id: string): Promise<Snapshot | undefined> {
    return tryReadJson<Snapshot>(
      this.filesApi,
      concatPath(this.dir(), `${encodeURIComponent(id)}.json`),
    );
  }
}

/** Register `WikiSnapshotsAdapter` (project-level). */
export function registerSnapshots(
  repository: ResourceRepository,
  deps: { clock?: () => string } = {},
): () => void {
  return repository.register("", WikiSnapshotsAdapter, (adaptable: Adaptable) => {
    return new WikiSnapshotsAdapter(adaptable, { clock: deps.clock });
  });
}
