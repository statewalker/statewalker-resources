import { default as expect } from "expect.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import ContentWriteAdapter from "../../src/core/ContentWriteAdapter.js";
import Repository from "../../src/core/Repository.js";
import RepositoryFilesAdapter from "../../src/core/RepositoryFilesAdapter.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import RepositoryInMemFilesAdapter from "../../src/core/RepositoryInMemFilesAdapter.js";

describe("RepositoryFilesAdapter", () => {
  let repository, files = {};
  beforeEach(() => {
    repository = new Repository();
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("text", TextAdapter);
    repository.register(
      Repository,
      RepositoryFilesAdapter,
      (repository) => new RepositoryInMemFilesAdapter(repository, { files })
    );
  });

  it(`should provide content`, async () => {
    files["foo/bar/baz.md"] = "Hello, there!";
    const resource = await repository.getResource("foo/bar/baz.md", true);
    const textAdapter = resource.requireAdapter(TextAdapter);
    const text = await textAdapter.getText();
    expect(text).to.be("Hello, there!");
  });

  it(`should be able to overwrite content`, async () => {
    files["foo/bar/baz.txt"] = "Hello, there!";
    const resource = await repository.getResource("foo/bar/baz.txt", true);
    const textAdapter = resource.getAdapter(TextAdapter);
    let text = await textAdapter.getText();
    expect(text).to.be("Hello, there!");

    const newText = "Hello Wonderful World!";
    await textAdapter.setText(newText);

    text = await textAdapter.getText();
    expect(text).to.be(newText);

    expect(text).to.eql(files["foo/bar/baz.txt"]);
  });
});
