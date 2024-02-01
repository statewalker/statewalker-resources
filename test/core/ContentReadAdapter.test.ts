import { describe, expect, it, beforeEach } from "../deps.ts";
import { ResourceRepository } from "@/core/Repository.ts";
import { ContentReadAdapter } from "@/core/ContentReadAdapter.ts";
import { TextAdapter } from "@/core/TextAdapter.ts";
import { MemFilesApi } from "@statewalker/webrun-files";
// import testError from "./testError.ts";

describe("ContentReadAdapter", () => {
  const resources = {
    "foobar.md": "# Hello, there!\n* item one\n* item two",
  };

  function newRepository(files = {}) {
    const filesApi = new MemFilesApi({ files });
    const repository = new ResourceRepository({ filesApi });
    repository.registerAdapter("", ContentReadAdapter);
    return repository;
  }

  let repository: ResourceRepository;
  beforeEach(() => {
    repository = newRepository(resources);
  });

  it(`exists: should return "false" for non-existing resource`, async () => {
    const resourceUrl = "toto.md";
    const resource = await repository.requireResource(resourceUrl);
    const contentAdapter = resource.getAdapter(ContentReadAdapter);
    expect(typeof contentAdapter).toBe("object");
    expect(await contentAdapter?.exists()).toBe(false);
  });

  it(`exists: should return "true" for existing resource`, async () => {
    const resourceUrl = "foobar.md";
    const resource = await repository.requireResource(resourceUrl);
    const contentAdapter = resource.getAdapter(ContentReadAdapter);
    expect(await contentAdapter?.exists()).toBe(true);
  });


  it(`should provide content for other adapters`, async () => {
    repository.registerAdapter("text", TextAdapter);
    const resourceUrl = "foobar.md";
    const resource = await repository.requireResource(resourceUrl);
    const textAdapter = resource.getAdapter(TextAdapter) as TextAdapter;
    expect(textAdapter instanceof TextAdapter).toBe(true);
    const text = await textAdapter.getText();
    expect(text).to.eql(resources[resourceUrl]);
  });
});
