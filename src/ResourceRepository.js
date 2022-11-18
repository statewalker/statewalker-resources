import { Adapters } from "@statewalker/adapters";
import getMimeType from "./utils/getMimeType.js";
import getTypePath from "./utils/getTypePath.js";
import Resource from "./Resource.js";

export default class ResourceRepository {

  constructor(options = { }) {
    this.options = options;
    this._index = new Map();
    this._adapters = new Adapters('/');
  }


  register(resourceType, adapterType, newAdapter) {
    this._setResourceAdapter(resourceType, adapterType, newAdapter);
  }

  async hasResource(url) {
    return this._index.has(url);
  }

  async* getResourceUrls() {
    yield* this._index.keys();
  }

  async* getResources() {
    yield* this._index.values();
  }

  async getAdapter(url, AdapterType, create = true) {
    const resource = await this.getResource(url, create);
    return resource ? resource.getAdapter(AdapterType) : null;
  }

  async requireAdapter(url, AdapterType, create = true) {
    const resource = await this.getResource(url, create);
    return resource ? resource.requireAdapter(AdapterType) : null;
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

  _getResourceAdapter(resourceType, adapterType) {
    resourceType = toPath(resourceType);
    adapterType = toPath(adapterType);
    const result = this._adapters.get(resourceType, adapterType);
    return result;
  }

  _setResourceAdapter(resourceType, adapterType, newAdapter) {
    const array = Array.isArray(resourceType) ? resourceType : [resourceType];
    newAdapter = newAdapter || adapterType;
    adapterType = toPath(adapterType);
    const registrations = array.map(resourceType => {
      resourceType = toPath(resourceType);
      return this._adapters.set(resourceType, adapterType, newAdapter);
    })
    return () => registrations.forEach(r => r());
  }

  _getResourceMimeType(url) {
    return getMimeType(url);
  }

}


function toPath(type) {
  return typeof type === 'function' ? getTypePath(type, "/") : type;
}