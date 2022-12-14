import getTypePath from "../utils/getTypePath.js";

export default class Adaptable {
  constructor(options = {}) {
    this.options = options;
    this._adaptersInstances = new Map();
  }

  get adapters() {
    return this.options.adapters;
  }
  get resourceType() {
    return getTypePath(this.constructor);
  }

  register(resourceType, adapterType, newAdapter) {
    const array = Array.isArray(resourceType) ? resourceType : [resourceType];
    newAdapter = newAdapter || adapterType;
    adapterType = this._toPath(adapterType);
    const adapters = this.adapters;
    const registrations = array.map((resourceType) => {
      resourceType = this._toPath(resourceType);
      return adapters.set(resourceType, adapterType, newAdapter);
    });
    return () => registrations.forEach((r) => r());
  }

  getAdapter(adapterType) {
    let adapter;
    if (this._adaptersInstances.has(adapterType)) {
      adapter = this._adaptersInstances.get(adapterType);
    } else {
      const Adapter = this._getAdapter(
        this.resourceType,
        adapterType,
      );
      adapter = typeof Adapter === "function"
        ? /^\s*class\s+/.test(Adapter.toString())
          ? new Adapter(this)
          : Adapter(this)
        : Adapter || null;
      this._adaptersInstances.set(adapterType, adapter);
    }
    return adapter;
  }

  requireAdapter(adapterType) {
    const adapter = this.getAdapter(adapterType);
    if (adapter === undefined || adapter === null) {
      const typePath = typeof adapterType === "function"
        ? getTypePath(adapterType, "/")
        : adapterType;
      throw new Error(
        `No required adapters found for this type of resources. ` +
          `Adapter type: "${typePath}`,
      );
    }
    return adapter;
  }

  _getAdapter(resourceType, adapterType) {
    resourceType = this._toPath(resourceType);
    adapterType = this._toPath(adapterType);
    const result = this.adapters.get(resourceType, adapterType);
    return result;
  }

  _toPath(type) {
    return typeof type === "function" ? getTypePath(type, "/") : type;
  }
}
