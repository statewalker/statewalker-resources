import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { ContentReadAdapter } from "../../src/core/content-read-adapter.js";
import { ContentWriteAdapter } from "../../src/core/content-write-adapter.js";
import { ResourceRepository } from "../../src/core/repository.js";
import { TextAdapter } from "../../src/core/text-adapter.js";
import { writeEntries } from "./write-entries.js";

async function newRepository(files: Record<string, string>) {
  const filesApi = new MemFilesApi();
  await filesApi.remove("/");
  await writeEntries(filesApi, files);
  const repository = new ResourceRepository({ filesApi });
  repository.register("", ContentReadAdapter);
  repository.register("", ContentWriteAdapter);
  repository.register("text", TextAdapter);
  return repository;
}

describe("RepositoryFilesAdapter", () => {
  it("should provide content", async () => {
    const repository = await newRepository({
      "/foo/bar/baz.md": "Hello, there!",
    });
    const resource = await repository.getResource("/foo/bar/baz.md", true);
    const textAdapter = resource!.requireAdapter<TextAdapter>(TextAdapter);
    const text = await textAdapter.getText();
    expect(text).toBe("Hello, there!");
  });

  it("should be able to overwrite content", async () => {
    const repository = await newRepository({
      "/foo/bar/baz.txt": "Hello, there!",
    });
    const resource = await repository.getResource("foo/bar/baz.txt", true);
    const textAdapter = resource!.getAdapter<TextAdapter>(TextAdapter)!;
    let text = await textAdapter.getText();
    expect(text).toBe("Hello, there!");

    const newText = "Hello Wonderful World!";
    await textAdapter.setText(newText);

    text = await textAdapter.getText();
    expect(text).toBe(newText);
  });
});
