import { default as expect } from "expect.js";
import Repository from "../../src/core/Repository.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import Workspace from "../../src/workspace/Workspace.js";
import Project from "../../src/workspace/Project.js";
import { MemFilesApi } from "@statewalker/webrun-files";
import JsonAdapter from "../../src/core/JsonAdapter.js";
// import testError from "./testError.js";

describe("ContentReadAdapter", () => {
  function toProjectManifest(json) {
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
    const repository = new Repository({ filesApi });
    repository.register("", ContentReadAdapter);
    repository.register("", TextAdapter);
    repository.register("", JsonAdapter);
    repository.register("", Project);
    repository.register(Repository, Workspace);
    return repository;
  }

  let repository;
  beforeEach(() => {
    repository = newRepository(resources);
  });

  it(`should return a list of already defined projects`, async () => {
    const workspace = repository.requireAdapter(Workspace);
    const projectNames = [];
    for await (const project of workspace.listProjects()) {
      projectNames.push(project.projectName);
    }
    expect(projectNames).to.eql([
      "projectOne",
      "projectThree",
      "projectTwo",
    ]);
    // console.log('>', project.projectName);
  });

  it(`should return projects by their name`, async () => {
    const workspace = repository.requireAdapter(Workspace);
    const project = await workspace.getProject("projectOne");
    expect(!!project).to.be(true);
    expect(typeof project).to.be("object");
    expect(project instanceof Project).to.be(true);
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
