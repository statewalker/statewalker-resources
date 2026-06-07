import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { ResourceRepository } from "../../src/core/repository.js";
import { TextAdapter } from "../../src/core/text-adapter.js";

function newRepository(files: Record<string, string> = {}) {
  const filesApi = new MemFilesApi({ initialFiles: files });
  const repository = new ResourceRepository({ filesApi });
  return repository;
}

describe("ResourceAdapter", () => {
  it("should be able to retrieve object adapters", async () => {
    const foobar = {};
    const repository = newRepository();
    repository.register("text", TextAdapter, foobar);
    const resource = await repository.getResource("abc.md", true);
    const textAdapter = resource!.getAdapter(TextAdapter);
    expect(textAdapter).toBe(foobar);
  });

  it("should be able to retrieve functional adapters", async () => {
    class MyTextAdapter extends TextAdapter {
      async getText() {
        return "Hello, world";
      }
    }

    const repository = newRepository();
    repository.register("text", TextAdapter, (resource: unknown) => {
      return new MyTextAdapter(resource as any);
    });
    const resource = await repository.getResource("abc.md", true);
    const textAdapter = resource!.getAdapter<TextAdapter>(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(true);
    expect(textAdapter instanceof MyTextAdapter).toBe(true);

    const secondTextAdapter = resource!.getAdapter(TextAdapter);
    expect(secondTextAdapter).toBe(textAdapter);

    expect(await textAdapter!.getText()).toEqual("Hello, world");
  });

  it("should be able to retrieve functional adapters returning plain objects", async () => {
    const repository = newRepository();
    repository.register("text", TextAdapter, () => ({
      async getText() {
        return "Hello, world";
      },
    }));
    const resource = await repository.getResource("abc.md", true);
    const textAdapter = resource!.getAdapter<{ getText: () => Promise<string> }>(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(false);

    const secondTextAdapter = resource!.getAdapter(TextAdapter);
    expect(secondTextAdapter).toBe(textAdapter);

    expect(await textAdapter!.getText()).toEqual("Hello, world");
  });

  it("should be able to retrieve class adapters", async () => {
    const repository = newRepository();
    repository.register(
      "text",
      TextAdapter,
      class extends TextAdapter {
        async getText() {
          return "Hello, world";
        }
      },
    );
    const resource = await repository.getResource("abc.md", true);
    const textAdapter = resource!.getAdapter<TextAdapter>(TextAdapter);
    expect(textAdapter instanceof TextAdapter).toBe(true);
    const secondTextAdapter = resource!.getAdapter(TextAdapter);
    expect(secondTextAdapter).toBe(textAdapter);
    expect(await textAdapter!.getText()).toEqual("Hello, world");
  });
});
