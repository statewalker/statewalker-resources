import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { ContentReadAdapter } from "../src/content-read-adapter.js";
import { ContentWriteAdapter } from "../src/content-write-adapter.js";
import { JsonAdapter } from "../src/json-adapter.js";
import { ResourceRepository } from "../src/repository.js";
import { TextAdapter } from "../src/text-adapter.js";

function newRepository(files: Record<string, string> = {}) {
  const filesApi = new MemFilesApi({ initialFiles: files });
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("", TextAdapter);
  repository.register("application/json", JsonAdapter);
  return repository;
}

describe("JsonAdapter", () => {
  it("should be able to load JSON adapter for resources with a good mime type", async () => {
    const repository = newRepository();
    // JSON mime type
    let resource = await repository.getResource("/a/b/c.json", true);
    let jsonAdapter = resource!.getAdapter<JsonAdapter>(JsonAdapter);
    expect(typeof jsonAdapter).toBe("object");
    expect(!!jsonAdapter).toBe(true);
    // Text mime type
    resource = await repository.getResource("/a/b/c.txt", true);
    jsonAdapter = resource!.getAdapter<JsonAdapter>(JsonAdapter);
    expect(jsonAdapter).toEqual(null);
  });

  it("should be able to store and load JSON objects", async () => {
    const repository = newRepository();
    const resource = await repository.getResource("/a/b/c.json", true);
    const jsonAdapter = resource!.getAdapter<JsonAdapter>(JsonAdapter)!;
    await jsonAdapter.setJson({
      message: "Hello, there",
      value: 123,
    });

    const test = await jsonAdapter.getJson();
    expect(test).toEqual({
      message: "Hello, there",
      value: 123,
    });
  });

  it("caching: should be able to re-use cached JSON instances", async () => {
    const repository = newRepository({
      "/a/b/c.json": JSON.stringify(
        {
          message: "Hello, there",
          value: 123,
        },
        null,
        2,
      ),
    });
    const resource = await repository.getResource("/a/b/c.json", true);
    const jsonAdapter = resource!.getAdapter<JsonAdapter>(JsonAdapter)!;
    const test1 = await jsonAdapter.getJson();
    const test2 = await jsonAdapter.getJson();
    expect(test1).toBe(test2);
  });

  it("caching: object updates should force re-loading of JSON instances", async () => {
    const repository = newRepository({
      "/a/b/c.json": JSON.stringify(
        {
          message: "Hello, there",
          value: 123,
        },
        null,
        2,
      ),
    });
    const resource = await repository.getResource("/a/b/c.json", true);
    const jsonAdapter = resource!.getAdapter<JsonAdapter>(JsonAdapter)!;
    const test1 = await jsonAdapter.getJson();
    expect(test1).toEqual({
      message: "Hello, there",
      value: 123,
    });
    let test2 = await jsonAdapter.getJson();
    expect(test1).toBe(test2);

    // Update value
    await jsonAdapter.setJson({
      message: "Hello, wonderful world!",
      value: 345,
    });
    test2 = await jsonAdapter.getJson();
    expect(test2).toEqual({
      message: "Hello, wonderful world!",
      value: 345,
    });
  });

  it("caching: text updates should force re-loading of JSON instances", async () => {
    const repository = newRepository({
      "/a/b/c.json": JSON.stringify(
        {
          message: "Hello, there",
          value: 123,
        },
        null,
        2,
      ),
    });
    const resource = await repository.getResource("/a/b/c.json", true);
    const jsonAdapter = resource!.getAdapter<JsonAdapter>(JsonAdapter)!;

    // Check that the JSON representation corresponds to the initial data
    let test1 = await jsonAdapter.getJson();
    expect(test1).toEqual({
      message: "Hello, there",
      value: 123,
    });

    // Update data using directly the text adapter
    const textAdapter = resource!.getAdapter<TextAdapter>(TextAdapter)!;
    const str = JSON.stringify({
      message: "Hello, wonderful world!",
      value: 345,
    });
    await textAdapter.setText(str);
    expect(await textAdapter.getText()).toEqual(str);

    // Reload the JSON representation.
    // It should reflect new JSON stored via TextAdapter.
    test1 = await jsonAdapter.getJson();
    expect(test1).toEqual({
      message: "Hello, wonderful world!",
      value: 345,
    });
  });
});
