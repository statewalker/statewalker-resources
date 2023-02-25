import { default as expect } from 'expect.js';
import Repository from "../../src/core/Repository.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import { FilesApi, MemFilesApi, NodeFilesApi } from "@statewalker/webrun-files";
// import { setLogLevel } from "@dynotes/logger";;
// setLogLevel('resources', 'debug');

describe('ResourceAdapter', () => {

  function newRepository(files = {}) {
    // const rootDir = new URL("./data-workspaces", import.meta.url).pathname;
    const filesApi = new MemFilesApi({ files });
    const repository = new Repository({ filesApi });
    return repository;
  }


  it(`should be able to retrieve object adapters`, async () => {
    const foobar = {};
    const repository = newRepository();
    repository.register('text', TextAdapter, foobar);
    const resource = await repository.getResource('abc.md', true);
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter).to.be(foobar);
  });

  it(`should be able to retrieve functional adapters`, async () => {

    class MyTextAdapter extends TextAdapter {
      async getText() {
        return 'Hello, world';
      }
    }

    const repository = newRepository();
    repository.register('text', TextAdapter, (resource) => {
      return new MyTextAdapter(resource);
    })
    const resource = await repository.getResource('abc.md', true);
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).to.be(true);
    expect(textAdapter instanceof MyTextAdapter).to.be(true);

    const secondTextAdapter = resource.getAdapter(TextAdapter);
    expect(secondTextAdapter).to.be(textAdapter);

    expect(await textAdapter.getText()).to.eql('Hello, world');
  });

  it(`should be able to retrieve functional adapters`, async () => {
    // The registered adapter implement the same methods as the 
    // adapter interface (TextAdapter in this case)
    const repository = newRepository();
    repository.register('text', TextAdapter, () => ({
      async getText() { return 'Hello, world' }
    }));
    const resource = await repository.getResource('abc.md', true);
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).to.be(false);

    const secondTextAdapter = resource.getAdapter(TextAdapter);
    expect(secondTextAdapter).to.be(textAdapter);

    expect(await textAdapter.getText()).to.eql('Hello, world');
  });


  it(`should be able to retrieve class adapters`, async () => {
    const repository = newRepository();
    repository.register('text', TextAdapter, class extends TextAdapter {
      async getText() {
        return 'Hello, world';
      }
    })
    const resource = await repository.getResource('abc.md', true);
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).to.be(true);
    const secondTextAdapter = resource.getAdapter(TextAdapter);
    expect(secondTextAdapter).to.be(textAdapter);
    expect(await textAdapter.getText()).to.eql('Hello, world');
  });

})