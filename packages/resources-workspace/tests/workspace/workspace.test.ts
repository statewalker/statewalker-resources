import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ContentReadAdapter,
  JsonAdapter,
  ResourceRepository,
  TextAdapter,
} from "../../src/core/index.js";
import { Project } from "../../src/workspace/project.js";
import { Workspace } from "../../src/workspace/workspace.js";

function toProjectManifest(json: object): string {
  return JSON.stringify(json, null, 2);
}

const resources: Record<string, string> = {
  "projectOne/.project.json": toProjectManifest({
    name: "First Project",
    foo: "Bar",
  }),
  "projectOne/index.md": "# First Project\n* item one\n* item two",

  "projectTwo/.project.json": toProjectManifest({
    name: "Second Project",
  }),
  "projectTwo/index.md": "# Second Project\nHello, there!",

  "projectThree/index.md": "# Third Project\nLorem ipsum...",
  "projectThree/.project.json": toProjectManifest({
    name: "Third Project",
  }),
};

function newRepository(files: Record<string, string> = {}) {
  const filesApi = new MemFilesApi({ initialFiles: files });
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", TextAdapter);
  repository.register("", JsonAdapter);
  repository.register("", Project);
  repository.register(ResourceRepository, Workspace);
  return repository;
}

describe("Workspace", () => {
  let repository: ResourceRepository;
  beforeEach(() => {
    repository = newRepository(resources);
  });

  it("should return a list of already defined projects", async () => {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const projectNames: string[] = [];
    for await (const project of workspace.listProjects()) {
      projectNames.push(project.projectName);
    }
    expect(projectNames.sort()).toEqual(["projectOne", "projectThree", "projectTwo"]);
  });

  it("should return projects by their name", async () => {
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const project = await workspace.getProject("projectOne");
    expect(!!project).toBe(true);
    expect(typeof project).toBe("object");
    expect(project instanceof Project).toBe(true);
    expect(project!.projectName).toEqual("projectOne");
  });
});
