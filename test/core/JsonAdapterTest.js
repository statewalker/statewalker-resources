import { default as expect } from 'expect.js';
import Repository from "../../src/core/Repository.js";
import ContentReadAdapter from "../../src/core/ContentReadAdapter.js";
import ContentWriteAdapter from "../../src/core/ContentWriteAdapter.js";
import TextAdapter from "../../src/core/TextAdapter.js";
import JsonAdapter from "../../src/core/JsonAdapter.js";
import { MemFilesApi } from "@statewalker/webrun-files";

describe('JsonAdapter', () => {

  function newRepository(files = {}) {
    const filesApi = new MemFilesApi({ files });
    const repository = new Repository({ filesApi });
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("", TextAdapter);
    repository.register("application/json", JsonAdapter);
    return repository;
  }

  it(`should be able to load JSON adapter for reosurces with a good mime type`, async () => {
    const repository = newRepository();
    // JSON mime type
    let resource = await repository.getResource('/a/b/c.json', true);
    let jsonAdapter = resource.getAdapter(JsonAdapter);
    expect(typeof jsonAdapter).to.be("object");
    expect(!!jsonAdapter).to.be(true);
    // Text mime type
    resource = await repository.getResource('/a/b/c.txt', true);
    jsonAdapter = resource.getAdapter(JsonAdapter);
    expect(jsonAdapter).to.eql(null);
  });


  it(`should be able to store and load JSON objects`, async () => {
    const repository = newRepository();
    let resource = await repository.getResource('/a/b/c.json', true);
    let jsonAdapter = resource.getAdapter(JsonAdapter);
    await jsonAdapter.setJson({
      message: "Hello, there",
      value : 123
    })

    let test = await jsonAdapter.getJson();
    expect(test).to.eql({
      message : "Hello, there",
      value : 123
    });
  })

  it(`caching: should be able to re-use cached JSON instances`, async () => {
    const repository = newRepository({
      "/a/b/c.json" : JSON.stringify({
        message : "Hello, there",
        value : 123
      }, null, 2)
    });
    const resource = await repository.getResource('/a/b/c.json', true);
    const jsonAdapter = resource.getAdapter(JsonAdapter);
    const test1 = await jsonAdapter.getJson();
    const test2 = await jsonAdapter.getJson();
    expect(test1).to.be(test2);
  });

  it(`caching: object updates should force re-loading of JSON instances`, async () => {
    const repository = newRepository({
      "/a/b/c.json" : JSON.stringify({
        message : "Hello, there",
        value : 123
      }, null, 2)
    });
    const resource = await repository.getResource('/a/b/c.json', true);
    const jsonAdapter = resource.getAdapter(JsonAdapter);
    let test1 = await jsonAdapter.getJson();
    expect(test1).to.eql({
      message : "Hello, there",
      value : 123
    })
    let test2 = await jsonAdapter.getJson();
    expect(test1).to.be(test2);

    // Update value
    await jsonAdapter.setJson({
      message : "Hello, wonderful world!",
      value : 345
    })
    test2 = await jsonAdapter.getJson();
    expect(test2).to.eql({
      message : "Hello, wonderful world!",
      value : 345
    })
  });

  it(`caching: text updates should force re-loading of JSON instances`, async () => {
    const repository = newRepository({
      "/a/b/c.json" : JSON.stringify({
        message : "Hello, there",
        value : 123
      }, null, 2)
    });
    const resource = await repository.getResource('/a/b/c.json', true);
    const jsonAdapter = resource.getAdapter(JsonAdapter);

    // Check that the JSON representation corresponds to the initial data
    let test1 = await jsonAdapter.getJson();
    expect(test1).to.eql({
      message : "Hello, there",
      value : 123
    })

    // Update data using directly the text adapter
    const textAdapter = resource.getAdapter(TextAdapter);
    const str = JSON.stringify({
      message : "Hello, wonderful world!",
      value : 345
    });
    await textAdapter.setText(str)
    expect(await textAdapter.getText()).to.eql(str)

    // Reload the JSON representation.
    // It should reflect new JSON stored via TextAdapter.
    test1 = await jsonAdapter.getJson();
    expect(test1).to.eql({
      message : "Hello, wonderful world!",
      value : 345
    });
  });


})