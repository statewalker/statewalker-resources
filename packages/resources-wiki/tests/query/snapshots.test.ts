import {
  ContentReadAdapter,
  Project,
  ResourceRepository,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import { type Answer, registerSnapshots, WikiSnapshotsAdapter } from "../../src/index.js";

function answer(text: string): Answer {
  return {
    text,
    citations: [],
    caveats: [],
    suggestions: [],
    topics: [],
    outliers: [],
    evidenceCount: 1,
  };
}

describe("WikiSnapshotsAdapter", () => {
  let repository: ResourceRepository;
  let clockValues: string[];

  beforeEach(() => {
    clockValues = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    repository = new ResourceRepository({
      filesApi: new MemFilesApi({ initialFiles: { "proj/a.md": "x" } }),
    });
    repository.register("", ContentReadAdapter);
    repository.register("", TextAdapter);
    repository.register("", Project);
    repository.register(ResourceRepository, Workspace);
    registerSnapshots(repository, { clock: () => clockValues.shift() ?? "z" });
  });

  it("saves, lists, reads back, and versions on re-save (frozen across the first)", async () => {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj");
    if (!project) throw new Error("no project");
    const snaps = project.requireAdapter(WikiSnapshotsAdapter);

    const id1 = await snaps.saveAnswer(answer("first"));
    const id2 = await snaps.saveAnswer(answer("second"));
    expect(id1).not.toBe(id2); // re-saving versions, never overwrites

    const list: string[] = [];
    for await (const s of snaps.listSnapshots()) list.push(s.id);
    expect(list.sort()).toEqual([id1, id2].sort());

    const got = await snaps.getSnapshot(id1);
    expect((got?.payload as Answer).text).toBe("first"); // first snapshot unchanged
    expect(got?.kind).toBe("answer");
  });

  it("records an optional label and surfaces it in listing + read-back", async () => {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj");
    if (!project) throw new Error("no project");
    const snaps = project.requireAdapter(WikiSnapshotsAdapter);

    const id = await snaps.saveAnswer(answer("hi"), "What is X?");
    const infos = [];
    for await (const s of snaps.listSnapshots()) infos.push(s);
    expect(infos.find((s) => s.id === id)?.label).toBe("What is X?");
    expect((await snaps.getSnapshot(id))?.label).toBe("What is X?");
  });
});
