import { parseUri } from "@statewalker/uris";
import ResourceAdapter from "./ResourceAdapter.js";

async function fetchWithAbort(url, params = { }) {
  const controller = new AbortController();
  const signal = controller.signal;
  const abort = () => (controller.abort(), { });
  if (typeof params === 'function') params = await params(abort);
  const res = await fetch(url, { ...params, signal });
  res.abort = abort;
  return res;
}

async function* handleFetchResults(res) {
  try {
    const body = res.body;
    if (typeof body.getReader === 'function') { // Browser
      const reader = body.getReader();
      let chunk;
      while ((chunk = await reader.read()) && !chunk.done) {
        yield chunk.value;
      }
    } else {
      yield* body;
    }
  } finally {
    if (typeof res.abort === 'function') res.abort();
  }
}

async function* fetchData(url, params) {
  const res = await fetchWithAbort(url, params);
  yield* handleFetchResults(res);
}

export default class ContentReadAdapter extends ResourceAdapter {

  static newContentReadAdapter(readFile) {
    return class UrlContentAdapter extends ContentReadAdapter {
      async* _readFile(pathname) { yield* readFile(pathname); }
    }
  }

  async exists() {
    return this._getValue('exists', async () => {
      let exists = false;
      try {
        for await (const block of this.readContent()) {
          if (block !== undefined) { exists = true; break; }
        }
      } catch (err) {
        /* */
      }
      return exists;
    })
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

  async* _readFile(/* pathname */) {
    yield (() => {
      throw new Error('The "_readFile" method should be overloaded in subclasses.');
    })();
  }

  async* readText() {
    const decoder = new TextDecoder();
    for await (const block of this.readContent()) {
      // FIXME: IT CAN GENERATE DECODE ERRORS BETWEEN BLOCKS!
      const chunk = decoder.decode(block);
      yield chunk;
    }
  }

}
