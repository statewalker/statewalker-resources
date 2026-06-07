import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ProjectBuilder,
  ResourceRepository,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTENT_SIGNAL,
  ContentAdapter,
  contentBuilder,
  registerContentExtraction,
} from "../../src/index.js";

function newRepository(files: Record<string, string>) {
  const repository = new ResourceRepository({ filesApi: new MemFilesApi({ initialFiles: files }) });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("", Project);
  repository.register("", ProjectBuilder);
  repository.register(ResourceRepository, Workspace);
  registerContentExtraction(repository);
  return repository;
}

describe("ContentAdapter", () => {
  let repository: ResourceRepository;

  beforeEach(() => {
    repository = newRepository({
      "proj/a.md": "# Title\n\nHello world.",
      "proj/logo.png": "binary-bytes",
    });
  });

  async function getProject() {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("proj");
    if (!project) throw new Error("project not found");
    return project;
  }

  it("is present and returns text for an extractable resource", async () => {
    const project = await getProject();
    const md = await project.getProjectResource("a.md");
    const content = md?.getAdapter(ContentAdapter) ?? null;
    expect(content).not.toBeNull();
    const text = await content?.readContent();
    expect(text).toContain("Hello world.");
  });

  it("is absent for a non-extractable resource", async () => {
    const project = await getProject();
    const png = await project.getProjectResource("logo.png");
    expect(png?.getAdapter(ContentAdapter) ?? null).toBeNull();
  });

  it("emits content for extractable sources and skips others", async () => {
    const project = await getProject();
    const builder = project.requireAdapter(ProjectBuilder);
    const emitted: string[] = [];
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder({
      id: "sink",
      inputs: [CONTENT_SIGNAL],
      outputs: [],
      // biome-ignore lint/correctness/useYield: a sink records updates and emits nothing
      async *handler(p) {
        const b = p.requireAdapter(ProjectBuilder);
        for await (const u of b.readUpdates({ signal: CONTENT_SIGNAL, cell: "sink" })) {
          emitted.push(u.uri);
          await u.handled();
        }
        return true;
      },
    });

    for await (const _ of builder.run()) {
      // drain
    }

    expect(emitted.sort()).toEqual(["a.md"]); // logo.png produced no content
  });
});

describe("ContentAdapter wiki-free contract", () => {
  it("imports no wiki-specific modules", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/content/content-adapter.ts"),
      "utf8",
    );
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec).not.toMatch(/\/(uri|knowledge|answers|search)\b/);
    }
    expect(src).not.toMatch(/\bWiki[A-Z]/);
  });
});
