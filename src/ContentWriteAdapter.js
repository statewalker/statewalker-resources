import ResourceAdapter from "./ResourceAdapter.js";
import { parseUri } from "@statewalker/uris";

export default class ContentWriteAdapter extends ResourceAdapter {

  static newWriteAdapter(writeFile) {
    return class UrlContentWriteAdapter extends ContentWriteAdapter {
      async _writeFile(pathname, content) { await writeFile(pathname, content); }
    }
  }

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

  async _writeFile(/* pathname, async* content() */) {
    await (async () => {
      throw new Error('The "_writeFile" method should be overloaded in subclasses.');
    })();
  }

}
