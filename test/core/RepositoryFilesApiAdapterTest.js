import { default as expect } from "expect.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import ContentWriteAdapter from "../../src/core/ContentWriteAdapter.js";
import Repository from "../../src/core/Repository.js";
import RepositoryFilesAdapter from "../../src/core/RepositoryFilesAdapter.js";
import TextAdapter from "../../src/core/TextAdapter.js";

import { FilesApi, MemFilesApi, NodeFilesApi } from "@statewalker/webrun-files";
import fs from "fs/promises";


describe("RepositoryFilesAdapter", () => {
  let repository, files = {};
  beforeEach(() => {
    repository = new Repository();
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("text", TextAdapter);
    repository.register(Repository, FilesApi, (repository) => {
      const rootDir = new URL("./data-workspaces", import.meta.url).pathname;
      return new NodeFilesApi({ fs, rootDir })
    })
    repository.register(
      Repository,
      RepositoryFilesAdapter,
      (repository) => {
        const rootDir = new URL("./data-workspaces", import.meta.url).pathname;
        const filesApi = new NodeFilesApi({ fs, rootDir })
        return new RepositoryFilesAdapter(repository, { filesApi });
      }
    );
  });

  it(`should be able to give access to FilesApi`, async () => {
    const filesApi = repository.requireAdapter(FilesApi);
    expect(typeof filesApi).to.be("object");

    const secondInstanceFilesApi = repository.requireAdapter(FilesApi);
    expect(secondInstanceFilesApi).to.be(filesApi);
  });

  it(`should be able to give access to FilesApi`, async () => {
    const filesAdapter = repository.requireAdapter(RepositoryFilesAdapter);
    console.log('>>', filesAdapter);
    expect(typeof filesAdapter).to.be("object");
  });




  // it(`should be able to overwrite content`, async () => {
  //   files["foo/bar/baz.txt"] = "Hello, there!";
  //   const resource = await repository.getResource("foo/bar/baz.txt", true);
  //   const textAdapter = resource.getAdapter(TextAdapter);
  //   let text = await textAdapter.getText();
  //   expect(text).to.be("Hello, there!");

  //   const newText = "Hello Wonderful World!";
  //   await textAdapter.setText(newText);

  //   text = await textAdapter.getText();
  //   expect(text).to.be(newText);

  //   // expect(text).to.eql(files["foo/bar/baz.txt"]);
  // });
});
