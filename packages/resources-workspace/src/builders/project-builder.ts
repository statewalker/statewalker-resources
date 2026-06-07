import {
  type CellDefinition,
  type CellHandler,
  DataflowGraph,
  readCellUpdates,
  UpdatesManager,
} from "@statewalker/shared-dataflow";
import type { FilesApi } from "@statewalker/webrun-files";
import { ResourceAdapter } from "../core/index.js";
import { concatPath } from "../utils/index.js";
import { Project } from "../workspace/project.js";
import { DEFAULT_SYSTEM_FOLDER } from "../workspace/workspace.js";
import { tryReadJson, writeJsonAtomic } from "./json-io.js";
import { FileBackedTransactionStore } from "./transaction-store.js";
import type {
  BuilderUpdate,
  BuildProgress,
  BuildStatus,
  RegisteredBuilder,
  SignalName,
} from "./types.js";
import { FileBackedUpdatesStore } from "./updates-store.js";

/** Reserved cell id of the built-in generic source scanner. */
export const SCAN_CELL = "@scan";
/** Base signals emitted by the scanner. */
export const SOURCES_SIGNAL: SignalName = "sources";
export const SOURCES_REMOVED_SIGNAL: SignalName = "sources:removed";

interface Stores {
  updates: FileBackedUpdatesStore;
  transactions: FileBackedTransactionStore;
  scannerState: Map<string, number>;
  scannerPath: string;
}

/**
 * The generic build engine, as an adapter on a project's directory resource.
 * Reached via `project.requireAdapter(ProjectBuilder)`. Schedules signal-driven
 * builders over `@statewalker/shared-dataflow`, drives the centralized update /
 * transaction stores (persisted under the project system folder), and provides
 * generic source change-detection. Knows nothing wiki-specific.
 */
/**
 * Cooperative-yield throttle config. Defaults keep a long build from starving the
 * event loop: a short pause every `pauseEvery` yields, and a re-run-requesting
 * interrupt every `interruptEvery` yields. Override via the repository option
 * `builderYield`.
 */
export interface YieldConfig {
  /** Pause (await `pauseMs`) once every this many `yieldControl` calls. */
  pauseEvery: number;
  /** Pause duration in ms. */
  pauseMs: number;
  /** Return `false` (request interrupt + re-run) once every this many calls. */
  interruptEvery: number;
  /** Safety cap on `run()` convergence passes. */
  maxPasses: number;
}

const DEFAULT_YIELD_CONFIG: YieldConfig = {
  pauseEvery: 10,
  pauseMs: 10,
  interruptEvery: 100,
  maxPasses: 1000,
};

export class ProjectBuilder extends ResourceAdapter {
  private readonly builders = new Map<string, RegisteredBuilder>();
  private graph?: DataflowGraph;
  private stores?: Stores;
  private yieldCounter = 0;

  private get yieldConfig(): YieldConfig {
    return {
      ...DEFAULT_YIELD_CONFIG,
      ...((this.repository.options.builderYield as Partial<YieldConfig> | undefined) ?? {}),
    };
  }

  private get filesApi(): FilesApi {
    return (this.repository as { filesApi: FilesApi }).filesApi;
  }

  private get project(): Project {
    return this.resource.requireAdapter<Project>(Project);
  }

  private get systemFolder(): string {
    return (this.repository.options.systemFolder as string | undefined) ?? DEFAULT_SYSTEM_FOLDER;
  }

  private stateDir(): string {
    return concatPath(this.project.path, this.systemFolder, "state");
  }

  /** Register a builder; returns an unregister function. */
  registerBuilder(builder: RegisteredBuilder): () => void {
    if (builder.id === SCAN_CELL) {
      throw new Error(`Builder id "${SCAN_CELL}" is reserved for the source scanner`);
    }
    this.builders.set(builder.id, builder);
    this.graph = undefined; // topology changed
    return () => {
      this.builders.delete(builder.id);
      this.graph = undefined;
    };
  }

  private getGraph(): DataflowGraph {
    if (!this.graph) {
      const defs: CellDefinition[] = [
        { id: SCAN_CELL, inputs: [], outputs: [SOURCES_SIGNAL, SOURCES_REMOVED_SIGNAL] },
        ...[...this.builders.values()].map((b) => ({
          id: b.id,
          inputs: [...b.inputs],
          outputs: [...b.outputs],
        })),
      ];
      this.graph = new DataflowGraph(defs);
    }
    return this.graph;
  }

  private async ensureStores(): Promise<Stores> {
    if (this.stores) return this.stores;
    const dir = this.stateDir();
    const files = this.filesApi;
    const updates = await FileBackedUpdatesStore.open(files, concatPath(dir, "updates.json"));
    const transactions = await FileBackedTransactionStore.open(
      files,
      concatPath(dir, "transactions.json"),
    );
    const scannerPath = concatPath(dir, "scanner.json");
    const saved = (await tryReadJson<Record<string, number>>(files, scannerPath)) ?? {};
    this.stores = {
      updates,
      transactions,
      scannerState: new Map(Object.entries(saved)),
      scannerPath,
    };
    return this.stores;
  }

  /**
   * Read the un-handled updates on `signal` for builder `cell`, in URI order.
   * Each yielded `BuilderUpdate.handled()` marks it consumed so it does not
   * reappear on the next run.
   */
  async *readUpdates(opts: { signal: SignalName; cell: string }): AsyncIterable<BuilderUpdate> {
    const { updates } = await this.ensureStores();
    const { signal, cell } = opts;
    for await (const e of updates.readUpdates({ signal, cell, orderBy: "uri" })) {
      yield {
        signal: e.signal,
        uri: e.uri,
        stamp: e.stamp,
        handled: async () => {
          await updates.handleUpdate({ signal: e.signal, uri: e.uri, cell, stamp: e.stamp });
        },
      };
    }
  }

  /**
   * Cooperative yield point for long-running builders. Builders MUST call this once
   * per processed item. It pauses briefly every `pauseEvery` calls to release the
   * event loop, and returns `false` every `interruptEvery` calls to request the
   * builder interrupt (return `false`) so `run()` can re-seed it on the next pass —
   * keeping a large build from monopolising CPU/memory.
   */
  async yieldControl(): Promise<boolean> {
    const cfg = this.yieldConfig;
    this.yieldCounter += 1;
    if (cfg.pauseEvery > 0 && this.yieldCounter % cfg.pauseEvery === 0) {
      await new Promise<void>((r) => setTimeout(r, cfg.pauseMs));
    }
    if (cfg.interruptEvery > 0 && this.yieldCounter % cfg.interruptEvery === 0) {
      return false;
    }
    return true;
  }

  /**
   * Run the pipeline: the built-in scanner (mtime detection → `sources`) plus the
   * registered builders, in signal-dependency order. Yields per-stage progress.
   */
  async *run(opts?: { builders?: string[] }): AsyncGenerator<BuildProgress> {
    const stores = await this.ensureStores();
    const graph = this.getGraph();
    const project = this.project;
    const errors: unknown[] = [];

    const handlers: Record<string, CellHandler> = {
      [SCAN_CELL]: async ({ transactionId }) => {
        await this.scan(stores, transactionId);
        return true;
      },
    };
    for (const b of this.builders.values()) {
      handlers[b.id] = async () => {
        const gen = b.handler(project);
        let res = await gen.next();
        while (!res.done) {
          const u = res.value;
          await stores.updates.setUpdate({ signal: u.signal, uri: u.uri, stamp: u.stamp });
          res = await gen.next();
        }
        return res.value !== false;
      };
    }

    const manager = new UpdatesManager({
      graph,
      store: stores.transactions,
      handlers,
      onError: (_cellId, error) => errors.push(error),
    });

    // Convergence loop: re-seed any cell that interrupted (returned `false`) until
    // none do, or the safety cap is hit. Builders interrupt cooperatively via
    // `yieldControl`, so a large build progresses in bounded passes.
    const maxPasses = this.yieldConfig.maxPasses;
    let seeds: { cells: string[] } | undefined = opts?.builders
      ? { cells: opts.builders }
      : undefined;
    try {
      for (let pass = 0; pass < maxPasses; pass++) {
        const interrupted = new Set<string>();
        for await (const stage of manager.run(seeds)) {
          if (stage.type === "begin") {
            yield { type: "begin", transactionId: stage.transactionId };
          } else if (stage.type === "end") {
            yield { type: "end", transactionId: stage.transactionId };
          } else {
            if (!stage.result) interrupted.add(stage.cellId);
            if (stage.cellId !== SCAN_CELL) {
              yield {
                type: "call",
                transactionId: stage.transactionId,
                builderId: stage.cellId,
                result: stage.result,
              };
            }
          }
        }
        if (interrupted.size === 0) break;
        seeds = { cells: [...interrupted] };
      }
    } finally {
      await this.flush(stores);
    }

    if (errors.length > 0) throw errors[0];
  }

  /** Per-builder pending counts and last-run transaction ids. */
  async status(): Promise<BuildStatus> {
    const stores = await this.ensureStores();
    const graph = this.getGraph();
    const builders = [];
    for (const b of this.builders.values()) {
      let pending = 0;
      for await (const _ of readCellUpdates(stores.updates, graph, b.id)) pending++;
      builders.push({
        id: b.id,
        pending,
        lastTransaction: await stores.transactions.getCellTransaction(b.id),
      });
    }
    return { nextTransactionId: stores.transactions.peekNextTransactionId(), builders };
  }

  /**
   * Reset `builderId` and every builder downstream of it (by signal dependency):
   * clear their handled watermarks and transaction watermarks so the next `run()`
   * re-derives them. Upstream builders are untouched.
   */
  async restartFrom(builderId: string): Promise<void> {
    const stores = await this.ensureStores();
    const graph = this.getGraph();
    const affected = new Set(graph.getExecutionOrderFromCells([builderId]));
    affected.add(builderId);
    for (const cell of affected) {
      for (const signal of graph.getCellInputs(cell)) {
        await stores.updates.clearHandled({ signal, cell });
      }
      await stores.transactions.removeCellTransactions(cell);
    }
    await this.flush(stores);
  }

  // ---- internals ----------------------------------------------------------

  /** Generic mtime change-detection: emit `sources` / `sources:removed`. */
  private async scan(stores: Stores, transactionId: number): Promise<void> {
    const { updates, scannerState } = stores;
    const base = this.project.path.replace(/^\/+|\/+$/g, "");
    const seen = new Set<string>();
    for await (const info of this.filesApi.list(this.project.path, { recursive: true })) {
      if (info.kind !== "file") continue;
      const uri = this.toProjectUri(info.path, base);
      if (uri === undefined) continue;
      // Skip dot-segments (system folder `.project/`, manifests, `.git`, …).
      if (uri.split("/").some((seg) => seg.startsWith("."))) continue;
      seen.add(uri);
      const mtime = (info as { lastModified?: number }).lastModified ?? 0;
      const prev = scannerState.get(uri);
      if (prev !== undefined && prev === mtime) continue;
      await updates.setUpdate({ signal: SOURCES_SIGNAL, uri, stamp: transactionId });
      scannerState.set(uri, mtime);
    }
    for (const uri of [...scannerState.keys()]) {
      if (seen.has(uri)) continue;
      await updates.setUpdate({ signal: SOURCES_REMOVED_SIGNAL, uri, stamp: transactionId });
      scannerState.delete(uri);
    }
  }

  /** Map a filesystem path under the project to a project-relative bare URI. */
  private toProjectUri(fsPath: string, base: string): string | undefined {
    const p = fsPath.replace(/^\/+/, "");
    if (base === "") return p;
    if (p === base) return undefined;
    if (!p.startsWith(`${base}/`)) return undefined;
    return p.slice(base.length + 1);
  }

  private async flush(stores: Stores): Promise<void> {
    await stores.updates.flush();
    await stores.transactions.flush();
    await writeJsonAtomic(
      this.filesApi,
      stores.scannerPath,
      Object.fromEntries(stores.scannerState),
    );
  }
}
