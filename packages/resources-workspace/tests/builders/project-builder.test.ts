import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import type { EmittedUpdate, RegisteredBuilder } from "../../src/builders/index.js";
import { ProjectBuilder } from "../../src/builders/index.js";
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

  it("reports pending counts via status before a run and zero after", async () => {
    const builder = await openBuilder();
    builder.registerBuilder(passthrough("extract", "sources", "content", []));

    await drain(builder.run());
    const before = await builder.status();
    const extract = before.builders.find((b) => b.id === "extract");
    expect(extract?.pending).toBe(0);
    expect(extract?.lastTransaction).toBeGreaterThan(0);
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
