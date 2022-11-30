import { parseUri } from "@statewalker/uris";
import ResourceAdapter from "./ResourceAdapter.js";
import RepositoryFilesAdapter from "./RepositoryFilesAdapter.js";

export default class ContentWriteAdapter extends ResourceAdapter {

  async writeContent(content) {
    const url = this.resource.url;
    const u = parseUri(url);
    if (!u.schema || u.schema === 'file') {
      await this._writeFile(u.path, content);
    } else {
      throw new Error(`Only the 'file' schema is supported`);
    }
  }

  async writeTextContent(content) {
    if (typeof content === 'string') {
      const str = content;
      content = async function* () { yield str; }()
    }
    const encoder = new TextEncoder();
    const it = (async function* () {
      for await (const str of content) {
        yield encoder.encode(str);
      }
    })();
    await this.writeContent(it);
  }

  async _writeFile(pathname, content /* async* content() */) {
    const filesAdapter = await this.repository.requireAdapter(RepositoryFilesAdapter);
    await filesAdapter.writeFile(pathname, content);
  }

}
