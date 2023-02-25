import { Adapters } from "@statewalker/adapters";
import getMimeType from "../utils/getMimeType.js";
import { parseUri } from "@statewalker/uris";
import Resource from "./Resource.js";
import Adaptable from "./Adaptable.js";
import { bindLruMethods } from "@statewalker/cache-mem";

export default class ResourceRepository extends Adaptable {
  constructor(options = {}) {
    super(options);

    if (!this.filesApi) throw new Error("FilesApi is not defined");
    this._cache = bindLruMethods({
      ...this.cacheParams,
      dispose(promise) {
        console.log("REMOVE RESOURCE", promise);
      },
    });
    this._loading = bindLruMethods(this.cacheParams);
    this._adapters = new Adapters("/");
  }

  get filesApi() {
    return this.options.filesApi;
  }

  get cacheParams() {
    let cacheParams = Object.assign({
      max: 1000,
      maxAge: 1000 * 60 * 60,
    }, this.options.cacheParams);
    return cacheParams;
  }

  get adapters() {
    return this._adapters;
  }

  async *getResources(prefix) {
    const basePath = this._resolvePath(prefix);
    for await (let { path } of this.filesApi.list(basePath)) {
      yield await this.getResource(path);
    }
  }

  async hasResource(url) {
    return !!await this.getResource(url, false);
  }

  async getResource(url, create) {
    let resource = await this._cache.get(url);
    if (!resource) {
      const promise = Promise.resolve().then(async () => {
        const path = this._resolvePath(url);
        const stats = await this.filesApi.stats(path);
        if (!stats && !create) return null;
        return this._newResource(url);
      }).catch((err) => {
        const p = this._cache.get(url);
        if (p === promise) this._cache.del(url);
        throw err;
      });
      this._cache.set(url, promise);
      resource = await promise;
    }
    return resource;
  }

  _resolvePath(path) {
    const filePath = parseUri(path).path;
    const segments = filePath.split("/").filter((s) => !!s && s !== ".");
    if (segments.length === 0) segments.push("");
    segments.unshift("");
    return segments.join("/");
  }

  _newResource(url) {
    const mimeType = this._getResourceMimeType(url);
    return new Resource({ repository: this, url, mimeType });
  }

  _getResourceMimeType(url) {
    return getMimeType(url);
  }
}
