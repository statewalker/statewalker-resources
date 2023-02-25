import { default as expect } from "expect.js";
import Repository from "../../src/core/Repository.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import { FilesApi, MemFilesApi, NodeFilesApi } from "@statewalker/webrun-files";
// import testError from "./testError.js";

describe("ContentReadAdapter", () => {
  const resources = {
    "foobar.md": "# Hello, there!\n* item one\n* item two",
  };

  function newRepository(files = {}) {
    const filesApi = new MemFilesApi({ files });
    const repository = new Repository({ filesApi });
    repository.register("", ContentReadAdapter);
    return repository;
  }

  let repository;
  beforeEach(() => {
    repository = newRepository(resources);
  });

  it(`exists: should return "false" for non-existing resource`, async () => {
    const resourceUrl = "toto.md";
    const resource = await repository.getResource(resourceUrl, true);
    const contentAdapter = resource.getAdapter(ContentReadAdapter);
    expect(await contentAdapter.exists()).to.be(false);
  });

  it(`exists: should return "true" for existing resource`, async () => {
    const resourceUrl = "foobar.md";
    const resource = await repository.getResource(resourceUrl, true);
    const contentAdapter = resource.getAdapter(ContentReadAdapter);
    expect(await contentAdapter.exists()).to.be(true);
  });

  it(`should provide content for other adapters`, async () => {
    repository.register("text", TextAdapter);
    const resourceUrl = "foobar.md";
    const resource = await repository.getResource(resourceUrl, true);
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).to.be(true);
    const text = await textAdapter.getText();
    expect(text).to.eql(resources[resourceUrl]);
  });
});
