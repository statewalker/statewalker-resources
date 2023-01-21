import RepositoryFilesAdapter from "./RepositoryFilesAdapter.js";

// import { setLogLevel } from "@dynotes/logger";;
// setLogLevel('resources', 'debug');
export default class RepositoryInMemFilesAdapter extends RepositoryFilesAdapter {
  constructor(repository, options) {
    super(repository, options);
    this._files = this.options.files || {};
  }
  get files() {
    return this._files;
  }

  async *readFile(pathname) {
    const content = this.files[pathname];
    let arrays;
    if (typeof content === "string") {
      arrays = [await (new Blob([content])).arrayBuffer()];
    } else if (Array.isArray(content))
      arrays = content;
    else
      throw new Error("Not found");
    yield* arrays;
  }

  async writeFile(pathname, content) {
    const blocks = [];
    for await (let block of content) {
      blocks.push(block.buffer ? block.buffer : block);
    }
    this.files[pathname] = blocks;
  }
}
