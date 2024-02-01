import { describe, expect, it } from "../deps.ts";

import { ResourceRepository } from "@/core/Repository.ts";
import { TextAdapter } from "@/core/TextAdapter.ts";
import { MemFilesApi } from "@statewalker/webrun-files";
import { Resource } from "src/core/Resource.ts";
// import { setLogLevel } from "@dynotes/logger";;
// setLogLevel('resources', 'debug');

describe("ResourceAdapter", () => {
  function newRepository(files = {}) {
    // const rootDir = new URL("./data-workspaces", import.meta.url).pathname;
    const filesApi = new MemFilesApi({ files });
    const repository = new ResourceRepository({ filesApi });
    return repository;
  }

  it(`should be able to retrieve object adapters`, async () => {
    const foobar = {};
    const repository = newRepository();
    repository.registerAdapter("text", TextAdapter, () => foobar);
    const resource = await repository.requireResource("abc.md");
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter).toBe(foobar);
  });

  it(`should be able to retrieve functional adapters`, async () => {
    class MyTextAdapter extends TextAdapter {
      async getText() {
        return "Hello, world";
      }
    }

    const repository = newRepository();
    repository.registerAdapter("text", TextAdapter, (resource) => {
      return new MyTextAdapter(resource);
    });
    const resource = await repository.requireResource("abc.md");
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(true);
    expect(textAdapter instanceof MyTextAdapter).toBe(true);

    const secondTextAdapter = resource.getAdapter(TextAdapter);
    expect(secondTextAdapter).toBe(textAdapter);

    expect(await textAdapter?.getText()).to.eql("Hello, world");
  });

  it(`should be able to retrieve functional adapters`, async () => {
    // The registered adapter implement the same methods as the
    // adapter interface (TextAdapter in this case)
    const repository = newRepository();
    class MyTextAdapter extends TextAdapter {
      async getText() {
        return "Hello, world";
      }
    }
    repository.registerAdapter("text", TextAdapter, (resource: Resource) =>
      new MyTextAdapter(resource)
    );
    const resource = await repository.requireResource("abc.md");
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(true);
    expect(textAdapter instanceof MyTextAdapter).toBe(true);

    const secondTextAdapter = resource.getAdapter(TextAdapter);
    expect(secondTextAdapter).toBe(textAdapter);

    expect(await textAdapter?.getText()).to.eql("Hello, world");
  });

  it(`should be able to retrieve class adapters`, async () => {
    const repository = newRepository();
    class MyTextAdapter extends TextAdapter {
      async getText() {
        return "Hello, world";
      }
    }
    repository.registerAdapter(
      "text",
      TextAdapter,
      (resource) => new MyTextAdapter(resource)
    );
    const resource = await repository.requireResource("abc.md");
    const textAdapter = resource.requireAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(true);
    const secondTextAdapter = resource.getAdapter(TextAdapter);
    expect(secondTextAdapter).toBe(textAdapter);
    expect(await textAdapter.getText()).to.eql("Hello, world");
  });
});
