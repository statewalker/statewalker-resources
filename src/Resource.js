// import { getLogger } from "@dynotes/logger";
import getTypePath from "./utils/getTypePath.js";

export default class Resource {

  constructor(options = { }) {
    this.options = options;
    this._adapters = new Map();
    if (!this.repository) throw new Error(`ResourceRepository is not defined.`)
    if (this.url === undefined) throw new Error(`URL is not defined.`)
    if (this.mimeType === undefined) throw new Error(`Mime type is not defined.`)
  }

  get repository() { return this.options.repository; }
  get mimeType() { return this.options.mimeType; }
  get resourceType() { return this.mimeType; }
  get url() { return this.options.url; }

  async clearValues() {
    delete this._values;
  }

  async _clearValue(key) {
    if (this._values) delete this._values[key];
  }

  async _getValue(key, newValue) {
    this._values = this._values || { };
    let value;
    if (key in this._values) {
      value = this._values[key];
    } else {
      this._values[key] = value = newValue();
    }
    return await value;
  }

  getAdapter(adapterType) {
    let adapter;
    if (this._adapters.has(adapterType)) {
      adapter = this._adapters.get(adapterType);
    } else {
      const Adapter = this.repository._getResourceAdapter(
        this.resourceType,
        adapterType
      );
      adapter = typeof Adapter === 'function'
        ? /^\s*class\s+/.test(Adapter.toString())
          ? new Adapter(this)
          : Adapter(this)
        : Adapter || null;
      this._adapters.set(adapterType, adapter);
    }
    return adapter;
  }

  requireAdapter(adapterType) {
    const adapter = this.getAdapter(adapterType);
    if (adapter === undefined || adapter === null) {
      const typePath = typeof adapterType === 'function'
        ? getTypePath(adapterType, "/")
        : adapterType;
      throw new Error(`No required adapters found for this type of resources. \n` +
        `- Resource URL: "${this.url}". \n` +
        `- Resource MimeType: "${this.mimeType}". \n` +
        `- Adapter type: "${typePath}`
      );
    }
    return adapter;
  }

}