import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import type { EmittedUpdate, RegisteredBuilder } from "../../src/builders/index.js";
import { ProjectBuilder } from "../../src/builders/index.js";
import { tryReadJson } from "../../src/builders/json-io.js";
import {
  ContentReadAdapter,
  ContentWriteAdapter,
  ResourceRepository,
  TextAdapter,
} from "../../src/core/index.js";
import { Project } from "../../src/workspace/project.js";
import { Workspace } from "../../src/workspace/workspace.js";

function newRepository(files: Record<string, string> = {}) {
  const filesApi = new MemFilesApi({ initialFiles: files });
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  return repository;
}

/**
 * A builder that mirrors each upstream update on `input` to `output`, recording
 * every URI it processed. `extraOutput` lets one builder emit a second signal so
 * we can chain a third stage.
 */
function passthrough(id: string, input: string, output: string, seen: string[]): RegisteredBuilder {
  return {
    id,
    inputs: [input],
    outputs: [output],
    async *handler(project): AsyncGenerator<EmittedUpdate, boolean> {
      const builder = project.requireAdapter(ProjectBuilder);
      for await (const u of builder.readUpdates({ signal: input, cell: id })) {
        seen.push(`${id}:${u.uri}`);
        yield { signal: output, uri: u.uri, stamp: u.stamp };
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      return true;
    },
  };
}

async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
  for await (const _ of gen) {
    // drain
  }
}

describe("ProjectBuilder", () => {
  let repository: ResourceRepository;

  beforeEach(() => {
    repository = newRepository({
      "proj/a.md": "# A",
      "proj/notes/b.md": "# B",
    });
  });

  async function openBuilder(): Promise<ProjectBuilder> {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj");
    return project!.requireAdapter(ProjectBuilder);
  }

  it("runs the pipeline as the union of registered builders in signal order", async () => {
    const builder = await openBuilder();
    const extractSeen: string[] = [];
    const indexSeen: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", extractSeen));
    builder.registerBuilder(passthrough("index", "content", "indexed", indexSeen));

    await drain(builder.run());

    // Scanner emitted `sources` for both files; extract handled them and emitted
    // `content`; index handled `content` — all within one run, in dependency order.
    expect(extractSeen.sort()).toEqual(["extract:a.md", "extract:notes/b.md"]);
    expect(indexSeen.sort()).toEqual(["index:a.md", "index:notes/b.md"]);
  });

  it("detects an out-of-band change and reprocesses only the changed page", async () => {
    const builder = await openBuilder();
    const seen: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", seen));

    await drain(builder.run());
    expect(seen.sort()).toEqual(["extract:a.md", "extract:notes/b.md"]);

    // Second run, nothing changed → no work.
    seen.length = 0;
    await drain(builder.run());
    expect(seen).toEqual([]);

    // Change one file (new mtime) → only it is reprocessed.
    const filesApi = (repository as unknown as { filesApi: MemFilesApi }).filesApi;
    await filesApi.write(
      "proj/a.md",
      (async function* () {
        yield new TextEncoder().encode("# A v2");
      })(),
    );
    seen.length = 0;
    await drain(builder.run());
    expect(seen).toEqual(["extract:a.md"]);
  });

  it("consumes each update once per builder (no-change run is a no-op)", async () => {
    const builder = await openBuilder();
    const calls: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", calls));

    await drain(builder.run());
    const first = calls.length;
    expect(first).toBe(2);

    await drain(builder.run());
    expect(calls.length).toBe(first); // nothing re-processed
  });

  it("restartFrom re-derives the builder and its downstream only", async () => {
    const builder = await openBuilder();
    const extractSeen: string[] = [];
    const indexSeen: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", extractSeen));
    builder.registerBuilder(passthrough("index", "content", "indexed", indexSeen));

    await drain(builder.run());
    extractSeen.length = 0;
    indexSeen.length = 0;

    await builder.restartFrom("index");
    await drain(builder.run());

    // index re-ran; extract (upstream) did not.
    expect(extractSeen).toEqual([]);
    expect(indexSeen.sort()).toEqual(["index:a.md", "index:notes/b.md"]);
  });

  it("excludes paths matched by .projectignore from scanning", async () => {
    const filesApi = new MemFilesApi({
      initialFiles: {
        "p/keep.md": "# keep",
        "p/reports/r1.md": "# r1",
        "p/drafts/d1.md": "# d1",
        "p/.projectignore": "reports\ndrafts/\n",
      },
    });
    const repo = new ResourceRepository({ filesApi });
    repo.register("", ContentReadAdapter);
    repo.register("", ContentWriteAdapter);
    repo.register("", TextAdapter);
    repo.register("", Project);
    repo.register("", ProjectBuilder);
    repo.register(ResourceRepository, Workspace);

    const project = await repo.requireAdapter<Workspace>(Workspace).getProject("p");
    const builder = project!.requireAdapter(ProjectBuilder);
    const seen: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", seen));
    await drain(builder.run());

    expect(seen).toEqual(["extract:keep.md"]); // reports/ and drafts/ excluded
  });

  it("prunes already-indexed sources when a .projectignore rule is added", async () => {
    const builder = await openBuilder();
    const added: string[] = [];
    const removed: string[] = [];
    builder.registerBuilder({
      id: "extract",
      inputs: ["sources", "sources-removed"],
      outputs: ["content"],
      async *handler(project): AsyncGenerator<EmittedUpdate, boolean> {
        const b = project.requireAdapter(ProjectBuilder);
        for await (const u of b.readUpdates({ signal: "sources", cell: "extract" })) {
          added.push(u.uri);
          yield { signal: "content", uri: u.uri, stamp: u.stamp };
          await u.handled();
        }
        for await (const u of b.readUpdates({ signal: "sources-removed", cell: "extract" })) {
          removed.push(u.uri);
          await u.handled();
        }
        return true;
      },
    });

    await drain(builder.run());
    expect(added.sort()).toEqual(["a.md", "notes/b.md"]);

    // Add a rule excluding notes/ — the previously-indexed page is now reported removed.
    const filesApi = (repository as unknown as { filesApi: MemFilesApi }).filesApi;
    await filesApi.write(
      "proj/.projectignore",
      (async function* () {
        yield new TextEncoder().encode("notes\n");
      })(),
    );
    added.length = 0;
    await drain(builder.run());
    expect(added).toEqual([]);
    expect(removed).toEqual(["notes/b.md"]);
  });

  it("persists scanner/build state at each transaction boundary (resumable after a hard stop)", async () => {
    const builder = await openBuilder();
    builder.registerBuilder(passthrough("extract", "sources", "content", []));
    const filesApi = (repository as unknown as { filesApi: MemFilesApi }).filesApi;
    const scannerPath = "proj/.project/state/scanner.json";

    // Drive run() manually and STOP at the first committed transaction without
    // returning the generator — i.e. no `finally`, simulating a process kill.
    const gen = builder.run();
    let sawEnd = false;
    for (let r = await gen.next(); !r.done; r = await gen.next()) {
      if ((r.value as { type: string }).type === "end") {
        sawEnd = true;
        break; // manual break does NOT call gen.return() → finally never runs
      }
    }
    expect(sawEnd).toBe(true);

    // State is already durable on disk (was previously only written in finally).
    const scanner = await tryReadJson<Record<string, number>>(filesApi, scannerPath);
    expect(scanner && Object.keys(scanner).sort()).toEqual(["a.md", "notes/b.md"]);
  });

  it("drains a behind stage before re-scanning for new work (drain-first)", async () => {
    const builder = await openBuilder();
    const extractSeen: string[] = [];
    const indexSeen: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", extractSeen));
    builder.registerBuilder(passthrough("index", "content", "indexed", indexSeen));
    await drain(builder.run());

    // Leave 'index' behind (as an interrupted downstream stage would be).
    await builder.restartFrom("index");
    indexSeen.length = 0;
    const order: string[] = [];
    for await (const stage of builder.run()) {
      if (stage.type === "call") order.push(stage.builderId);
    }
    // The behind stage is drained first — before 'extract' runs again in the scan phase.
    expect(order[0]).toBe("index");
    expect(indexSeen.sort()).toEqual(["index:a.md", "index:notes/b.md"]);
  });

  it("flushes state as each cell's transaction advances, not only at the end", async () => {
    const filesApi = new MemFilesApi({ initialFiles: { "p/a.md": "A" } });
    const repo = new ResourceRepository({ filesApi, builderYield: { flushThrottleMs: 0 } });
    repo.register("", ContentReadAdapter);
    repo.register("", ContentWriteAdapter);
    repo.register("", TextAdapter);
    repo.register("", Project);
    repo.register("", ProjectBuilder);
    repo.register(ResourceRepository, Workspace);
    const project = await repo.requireAdapter<Workspace>(Workspace).getProject("p");
    const builder = project!.requireAdapter(ProjectBuilder);
    builder.registerBuilder(passthrough("extract", "sources", "content", []));

    // Stop at the first builder 'call' — before the transaction 'end'.
    const gen = builder.run();
    for (let r = await gen.next(); !r.done; r = await gen.next()) {
      if ((r.value as { type: string }).type === "call") break;
    }
    // The scanner and extract were both committed and flushed before any 'end'.
    const tx = await tryReadJson<{ cellTransactions: Record<string, number> }>(
      filesApi,
      "p/.project/state/transactions.json",
    );
    expect(Object.keys(tx?.cellTransactions ?? {}).sort()).toEqual(["SourceScanner", "extract"]);
  });

  it("reports pending counts via status before a run and zero after", async () => {
    const builder = await openBuilder();
    builder.registerBuilder(passthrough("extract", "sources", "content", []));

    await drain(builder.run());
    const before = await builder.status();
    const extract = before.builders.find((b) => b.id === "extract");
    expect(extract?.pending).toBe(0);
    expect(extract?.lastTransaction).toBeGreaterThan(0);
  });

  it("checkpoints handled progress when yieldControl interrupts (durable mid-build)", async () => {
    const filesApi = new MemFilesApi({
      initialFiles: { "p/1.md": "1", "p/2.md": "2", "p/3.md": "3", "p/4.md": "4", "p/5.md": "5" },
    });
    const make = () => {
      const repo = new ResourceRepository({
        filesApi,
        builderYield: { interruptEvery: 2, pauseEvery: 0, pauseMs: 0, maxPasses: 100 },
      });
      repo.register("", ContentReadAdapter);
      repo.register("", ContentWriteAdapter);
      repo.register("", TextAdapter);
      repo.register("", Project);
      repo.register("", ProjectBuilder);
      repo.register(ResourceRepository, Workspace);
      return repo;
    };

    const project = await make().requireAdapter<Workspace>(Workspace).getProject("p");
    const builder = project!.requireAdapter(ProjectBuilder);
    const seen: string[] = [];
    builder.registerBuilder(passthrough("extract", "sources", "content", seen));

    // Drive run() and abandon at the first interrupt (yieldControl → false), without
    // returning the generator (no finally). interruptEvery:2 → 2 items handled.
    const gen = builder.run();
    for (let r = await gen.next(); !r.done; r = await gen.next()) {
      const v = r.value as { type: string; builderId?: string; result?: boolean };
      if (v.type === "call" && v.builderId === "extract" && v.result === false) break;
    }
    expect(seen.length).toBe(2);

    // A fresh ProjectBuilder over the SAME files sees those 2 updates already handled
    // and flushed — only the remaining 3 are pending (no re-processing on resume).
    const fresh = (await make().requireAdapter<Workspace>(Workspace).getProject("p"))!;
    const freshBuilder = fresh.requireAdapter(ProjectBuilder);
    freshBuilder.registerBuilder(passthrough("extract", "sources", "content", []));
    const status = await freshBuilder.status();
    expect(status.builders.find((b) => b.id === "extract")?.pending).toBe(3);
  });

  it("converges across yieldControl interrupts, processing every item once", async () => {
    // interruptEvery: 2 makes the passthrough's yieldControl return false on every
    // 2nd item, forcing the builder to interrupt; run() must re-seed it until done.
    const filesApi = new MemFilesApi({
      initialFiles: { "p/1.md": "1", "p/2.md": "2", "p/3.md": "3", "p/4.md": "4", "p/5.md": "5" },
    });
    const repo = new ResourceRepository({
      filesApi,
      builderYield: { interruptEvery: 2, pauseEvery: 0, pauseMs: 0, maxPasses: 100 },
    });
    repo.register("", ContentReadAdapter);
    repo.register("", ContentWriteAdapter);
    repo.register("", TextAdapter);
    repo.register("", Project);
    repo.register("", ProjectBuilder);
    repo.register(ResourceRepository, Workspace);
    const workspace = repo.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("p");
    const builder = project?.requireAdapter(ProjectBuilder);
    const seen: string[] = [];
    builder?.registerBuilder(passthrough("extract", "sources", "content", seen));
    await drain(builder?.run() ?? (async function* () {})());

    expect(seen.sort()).toEqual([
      "extract:1.md",
      "extract:2.md",
      "extract:3.md",
      "extract:4.md",
      "extract:5.md",
    ]);
  });
});
