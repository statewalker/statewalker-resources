import { Adapters } from "@statewalker/adapters";
import getMimeType from "../utils/getMimeType.js";
import Resource from "./Resource.js";
import Adaptable from "./Adaptable.js";

export default class ResourceRepository extends Adaptable {
  constructor(options = {}) {
    super(options);
    this._index = new Map();
    this._adapters = new Adapters("/");
  }

  get adapters() {
    return this._adapters;
  }

  async hasResource(url) {
    return this._index.has(url);
  }

  async *getResourceUrls() {
    yield* this._index.keys();
  }

  async *getResources() {
    yield* this._index.values();
  }

  async getResource(url, create) {
    let resource = this._index.get(url);
    if (!resource && create) {
      resource = this._newResource(url);
      this._index.set(url, resource);
    }
    return resource;
  }

  _newResource(url) {
    const mimeType = this._getResourceMimeType(url);
    return new Resource({ repository: this, url, mimeType });
  }

  _getResourceMimeType(url) {
    return getMimeType(url);
  }
}
