import { describe, expect, it, beforeEach } from "../deps.ts";

import { ResourceRepository } from "@/core/Repository.ts";
import { ContentReadAdapter } from "@/core/ContentReadAdapter.ts";
import { TextAdapter } from "@/core/TextAdapter.ts";
import { Workspace } from "@/workspace/Workspace.ts";
import { Project } from "@/workspace/Project.ts";
import { MemFilesApi } from "@statewalker/webrun-files";
import { JsonAdapter } from "@/core/JsonAdapter.ts";
// import testError from "./testError.ts";

describe("Workspace", () => {
  function toProjectManifest(json: object) {
    return JSON.stringify(json, null, 2);
  }
  const resources = {
    "projectOne/.project.json": toProjectManifest({
      name: "First Project",
      foo: "Bar",
    }),
    "projectOne/index.md": "# First Notebook\n* item one\n* item two",

    // "notAProject/index.md": "Hello, there!",

    "projectTwo/.project.json": toProjectManifest({
      name: "Second Project",
    }),
    "projectTwo/index.md": "# Second Notebook\nHello, there!",

    "projectThree/index.md": "# Third Notebook\nLorem ipsum...",
    "projectThree/.project.json": toProjectManifest({
      name: "Third Project",
    }),
  };

  function newRepository(files = {}) {
    const filesApi = new MemFilesApi({ files });
    const repository = new ResourceRepository({ filesApi });
    repository.registerAdapter("", ContentReadAdapter);
    repository.registerAdapter("", TextAdapter);
    repository.registerAdapter("", JsonAdapter);
    repository.registerAdapter("", Project);
    repository.registerRepositoryAdapter(Workspace);
    return repository;
  }

  let repository: ResourceRepository;
  beforeEach(() => {
    repository = newRepository(resources);
  });

  it(`should return a list of already defined projects`, async () => {
    const workspace = repository.requireAdapter(Workspace);
    const projectNames = [];
    for await (const project of workspace.listProjects()) {
      projectNames.push(project.projectName);
    }
    expect(projectNames).to.eql(["projectOne", "projectThree", "projectTwo"]);
    // console.log('>', project.projectName);
  });

  it(`should return projects by their name`, async () => {
    const workspace = repository.requireAdapter(Workspace);
    const project = await workspace.getProject("projectOne");
    expect(!!project).toBe(true);
    expect(typeof project).toBe("object");
    expect(project instanceof Project).toBe(true);
    expect(project.projectName).to.eql("projectOne");
  });

  // it(`should get project manifests`, async () => {
  //   const workspace = repository.requireAdapter(Workspace);
  //   const project = await workspace.getProject("projectOne");
  //   const manifest = await project.getManifest();
  //   expect(manifest).to.eql({
  //     name: "First Project",
  //     foo: "Bar",
  //   });
  // });
});
