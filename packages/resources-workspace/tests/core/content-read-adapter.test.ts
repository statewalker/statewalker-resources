import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { beforeEach, describe, expect, it } from "vitest";
import { ContentReadAdapter } from "../../src/core/content-read-adapter.js";
import { ResourceRepository } from "../../src/core/repository.js";
import { TextAdapter } from "../../src/core/text-adapter.js";

describe("ContentReadAdapter", () => {
  const resources: Record<string, string> = {
    "foobar.md": "# Hello, there!\n* item one\n* item two",
  };

  function newRepository(files: Record<string, string> = {}) {
    const filesApi = new MemFilesApi({ initialFiles: files });
    const repository = new ResourceRepository({ filesApi });
    repository.register("", ContentReadAdapter);
    return repository;
  }

  let repository: ResourceRepository;
  beforeEach(() => {
    repository = newRepository(resources);
  });

  it('exists: should return "false" for non-existing resource', async () => {
    const resourceUrl = "toto.md";
    const resource = await repository.getResource(resourceUrl, true);
    const contentAdapter = resource!.getAdapter<ContentReadAdapter>(ContentReadAdapter);
    expect(await contentAdapter!.exists()).toBe(false);
  });

  it('exists: should return "true" for existing resource', async () => {
    const resourceUrl = "foobar.md";
    const resource = await repository.getResource(resourceUrl, true);
    const contentAdapter = resource!.getAdapter<ContentReadAdapter>(ContentReadAdapter);
    expect(await contentAdapter!.exists()).toBe(true);
  });

  it("should provide content for other adapters", async () => {
    repository.register("text", TextAdapter);
    const resourceUrl = "foobar.md";
    const resource = await repository.getResource(resourceUrl, true);
    const textAdapter = resource!.getAdapter<TextAdapter>(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(true);
    const text = await textAdapter!.getText();
    expect(text).toEqual(resources[resourceUrl]);
  });
});
