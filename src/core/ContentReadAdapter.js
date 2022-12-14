import { parseUri } from "@statewalker/uris";
import { fetchData } from "../utils/fetch.js";
import ResourceAdapter from "./ResourceAdapter.js";
import RepositoryFilesAdapter from "./RepositoryFilesAdapter.js";

export default class ContentReadAdapter extends ResourceAdapter {

  async exists() {
    let exists = false;
    try {
      for await (const block of this.readContent()) {
        if (block !== undefined) { exists = true; break; }
      }
    } catch (err) {
      /* */
    }
    return exists;
  }

  async* readContent() {
    const url = this.resource.url;
    const u = parseUri(url);
    if (!u.schema || (u.schema === 'file')) {
      yield* this._readFile(u.path);
    } else {
      yield* this._readUrl(url);
    }
  }

  async* _readUrl(url, params = { }) {
    yield* fetchData(url, params);
  }

  async* _readFile(pathname) {
    const filesAdapter = await this.repository.requireAdapter(RepositoryFilesAdapter);
    yield* filesAdapter.readFile(pathname);
  }

  async* readText() {
    const decoder = new TextDecoder();
    for await (const block of this.readContent()) {
      const chunk = decoder.decode(block);
      yield chunk;
    }
  }

}
