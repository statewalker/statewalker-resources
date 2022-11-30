import { Adapters } from "@statewalker/adapters";
import getMimeType from "./utils/getMimeType.js";
import Resource from "./Resource.js";
import Adaptable from "./Adaptable.js";

export default class ResourceRepository extends Adaptable {

  constructor(options = { }) {
    super(options);
    this._index = new Map();
    this._adapters = new Adapters('/');
  }

  get adapters() { return this._adapters; }

  async hasResource(url) {
    return this._index.has(url);
  }

  async* getResourceUrls() {
    yield* this._index.keys();
  }

  async* getResources() {
    yield* this._index.values();
  }

  async getResource(url, create) {
    let resource = this._index.get(url);
    if (!resource && create) {
      const mimeType = this._getResourceMimeType(url);
      resource = new Resource({ repository: this, url, mimeType });
      this._index.set(url, resource);
    }
    return resource;
  }

  _getResourceMimeType(url) {
    return getMimeType(url);
  }

}
