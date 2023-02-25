import { default as expect } from "expect.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import ContentWriteAdapter from "../../src/core/ContentWriteAdapter.js";
import Repository from "../../src/core/Repository.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import { FilesApi, MemFilesApi, NodeFilesApi } from "@statewalker/webrun-files";
import fs from "fs/promises";
import writeEntries from "./writeEntries.js";

describe("RepositoryFilesAdapter", () => {
  async function newRepository(files) {
    const rootDir = new URL("./data-workspaces", import.meta.url).pathname;
    const filesApi = new NodeFilesApi({ fs, rootDir });
    // await filesApi.remove("/");
    await writeEntries(filesApi, files);
    // const filesApi = new MemFilesApi({ files });
    const repository = new Repository({ filesApi });
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("text", TextAdapter);
    return repository;
  }

  it(`should provide content`, async () => {
    const repository = await newRepository({
      "/foo/bar/baz.md": "Hello, there!",
    });
    const resource = await repository.getResource("/foo/bar/baz.md", true);
    const textAdapter = resource.requireAdapter(TextAdapter);
    const text = await textAdapter.getText();
    expect(text).to.be("Hello, there!");
  });

  it(`should be able to overwrite content`, async () => {
    const repository = await newRepository({
      "/foo/bar/baz.txt": "Hello, there!",
    });
    const resource = await repository.getResource("foo/bar/baz.txt", true);
    const textAdapter = resource.getAdapter(TextAdapter);
    let text = await textAdapter.getText();
    expect(text).to.be("Hello, there!");

    const newText = "Hello Wonderful World!";
    await textAdapter.setText(newText);

    text = await textAdapter.getText();
    expect(text).to.be(newText);

    // expect(text).to.eql(files["foo/bar/baz.txt"]);
  });
});
