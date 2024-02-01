import { describe, expect, it } from "../deps.ts";
import { ResourceRepository } from "@/core/Repository.ts";
import { ContentReadAdapter } from "@/core/ContentReadAdapter.ts";
import { ContentWriteAdapter } from "@/core/ContentWriteAdapter.ts";
import { TextAdapter } from "@/core/TextAdapter.ts";
import { JsonAdapter } from "@/core/JsonAdapter.ts";
import { MemFilesApi } from "@statewalker/webrun-files";

describe("JsonAdapter", () => {
  function newRepository(files = {}) {
    const filesApi = new MemFilesApi({ files });
    const repository = new ResourceRepository({ filesApi });
    repository.registerAdapter("", ContentReadAdapter);
    repository.registerAdapter("", ContentWriteAdapter);
    repository.registerAdapter("", TextAdapter);
    repository.registerAdapter("application/json", JsonAdapter);
    return repository;
  }

  it(`should be able to load JSON adapter for reosurces with a good mime type`, async () => {
    const repository = newRepository();
    // JSON mime type
    let resource = await repository.requireResource("/a/b/c.json");
    let jsonAdapter = resource.getAdapter(JsonAdapter);
    expect(typeof jsonAdapter).toBe("object");
    expect(!!jsonAdapter).toBe(true);
    // Text mime type
    resource = await repository.requireResource("/a/b/c.txt");
    jsonAdapter = resource.getAdapter(JsonAdapter);
    expect(jsonAdapter).toEqual(undefined);
  });

  it(`should be able to store and load JSON objects`, async () => {
    const repository = newRepository();
    const resource = await repository.requireResource("/a/b/c.json");
    const jsonAdapter = resource.requireAdapter(JsonAdapter);
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

  it(`should be able to reflect data updated with text adapters`, async () => {
    const repository = newRepository();
    const resource = await repository.requireResource("/a/b/c.json");
    const textAdapter = resource.requireAdapter(TextAdapter);
    const jsonAdapter = resource.requireAdapter(JsonAdapter);
    expect(await jsonAdapter.getJson()).toEqual(undefined);
    expect(await textAdapter.getText()).toEqual("");

    let json = {
      message: "Hello, there",
      value: 123,
    };
    await textAdapter.setText(JSON.stringify(json));
    expect(await jsonAdapter.getJson()).toEqual(json);
    expect(await textAdapter.getText()).toEqual(JSON.stringify(json));

    json = {
      message: "Hello World!",
      value: 345,
    };
    await textAdapter.setText(JSON.stringify(json));
    expect(await jsonAdapter.getJson()).toEqual(json);
    expect(await textAdapter.getText()).toEqual(JSON.stringify(json));

  });

  it(`caching: should be able to re-use cached JSON instances`, async () => {
    const repository = newRepository({
      "/a/b/c.json": JSON.stringify(
        {
          message: "Hello, there",
          value: 123,
        },
        null,
        2
      ),
    });
    const resource = await repository.requireResource("/a/b/c.json");
    const jsonAdapter = resource.requireAdapter(JsonAdapter);
    const test1 = await jsonAdapter.getJson();
    const test2 = await jsonAdapter.getJson();
    expect(test1).toBe(test2);
  });

  it(`caching: object updates should force re-loading of JSON instances`, async () => {
    const repository = newRepository({
      "/a/b/c.json": JSON.stringify(
        {
          message: "Hello, there",
          value: 123,
        },
        null,
        2
      ),
    });
    const resource = await repository.requireResource("/a/b/c.json");
    const jsonAdapter = resource.requireAdapter(JsonAdapter);
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

  it(`caching: text updates should force re-loading of JSON instances`, async () => {
    const repository = newRepository({
      "/a/b/c.json": JSON.stringify(
        {
          message: "Hello, there",
          value: 123,
        },
        null,
        2
      ),
    });
    const resource = await repository.requireResource("/a/b/c.json");
    const jsonAdapter = resource.requireAdapter(JsonAdapter);

    // Check that the JSON representation corresponds to the initial data
    let test1 = await jsonAdapter.getJson();
    expect(test1).toEqual({
      message: "Hello, there",
      value: 123,
    });

    // Update data using directly the text adapter
    const textAdapter = resource.requireAdapter(TextAdapter);
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
