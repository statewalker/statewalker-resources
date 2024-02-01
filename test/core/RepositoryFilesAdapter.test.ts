import { describe, expect, it } from "../deps.ts";

import { MemFilesApi } from "@statewalker/webrun-files";
import { ContentReadAdapter } from "@/core/ContentReadAdapter.ts";
import { ContentWriteAdapter } from "@/core/ContentWriteAdapter.ts";
import { ResourceRepository } from "@/core/Repository.ts";
import { TextAdapter } from "@/core/TextAdapter.ts";
import { writeEntries } from "../writeEntries.ts";

describe("RepositoryFilesAdapter", () => {
  async function newRepository(files = {}) {
    // const rootDir = new URL("./data-workspaces", import.meta.url).pathname;
    // const filesApi = new NodeFilesApi({ fs, rootDir });
    const filesApi = new MemFilesApi();
    await filesApi.remove("/");
    await writeEntries(filesApi, files);
    const repository = new ResourceRepository({ filesApi });
    repository.registerAdapter("", ContentReadAdapter);
    repository.registerAdapter("", ContentWriteAdapter);
    repository.registerAdapter("text", TextAdapter);
    return repository;
  }

  it(`should provide content`, async () => {
    const repository = await newRepository({
      "/foo/bar/baz.md": "Hello, there!",
    });
    const resource = await repository.requireResource("/foo/bar/baz.md");
    const textAdapter = resource.requireAdapter(TextAdapter);
    const text = await textAdapter.getText();
    expect(text).toBe("Hello, there!");
  });

  it(`should be able to overwrite content`, async () => {
    const repository = await newRepository({
      "/foo/bar/baz.txt": "Hello, there!",
    });
    const resource = await repository.requireResource("foo/bar/baz.txt");
    const textAdapter = resource.requireAdapter(TextAdapter);
    let text = await textAdapter.getText();
    expect(text).toBe("Hello, there!");

    const newText = "Hello Wonderful World!";
    await textAdapter.setText(newText);

    text = await textAdapter.getText();
    expect(text).toBe(newText);

    // expect(text).to.eql(files["foo/bar/baz.txt"]);
  });
});
