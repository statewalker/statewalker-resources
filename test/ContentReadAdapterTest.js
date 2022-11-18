import { default as expect } from 'expect.js';
import ResourceRepository from "../src/ResourceRepository.js";
import ContentReadAdapter from "../src/ContentReadAdapter.js";
import TextAdapter from "../src/TextAdapter.js";
// import testError from "./testError.js";

describe('ContentReadAdapter', () => {

  const resources = {
    'foobar.md': '# Hello, there!\n* item one\n* item two'
  }

  let repository;
  beforeEach(() => {
    repository = new ResourceRepository();
    repository.register('', ContentReadAdapter, class extends ContentReadAdapter {
      async* readContent() {
        const url = this.resource.url;
        const content = resources[url];
        if (!content) throw new Error(`Resource not found. URL: "${url}"`);
        yield Buffer.from(content);
      }
    });
  });

  it(`exists: should return "false" for non-existing resource`, async () => {
    const resourceUrl = 'toto.md';
    const resource = await repository.getResource(resourceUrl, true);
    const contentAdapter = resource.getAdapter(ContentReadAdapter);
    expect(await contentAdapter.exists()).to.be(false);
  });

  it(`exists: should return "true" for existing resource`, async () => {
    const resourceUrl = 'foobar.md';
    const resource = await repository.getResource(resourceUrl, true);
    const contentAdapter = resource.getAdapter(ContentReadAdapter);
    expect(await contentAdapter.exists()).to.be(true);
  });

  it(`should provide content for other adapters`, async () => {
    repository.register('text', TextAdapter);
    const resourceUrl = 'foobar.md';
    const resource = await repository.getResource(resourceUrl, true);
    const textAdapter = resource.getAdapter(TextAdapter);
    expect(textAdapter instanceof TextAdapter).to.be(true);
    const text = await textAdapter.getText();
    expect(text).to.eql(resources[resourceUrl]);
  });


});