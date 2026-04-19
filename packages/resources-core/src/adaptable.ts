import type { Adapters } from "@statewalker/adapters";
import { getTypePath } from "@statewalker/resources-utils";

export interface AdaptableOptions {
  adapters?: Adapters;
  [key: string]: unknown;
}

export class Adaptable {
  options: AdaptableOptions;
  _adaptersInstances: Map<unknown, unknown>;

  constructor(options: AdaptableOptions = {}) {
    this.options = options;
    this._adaptersInstances = new Map();
  }

  get adapters(): Adapters {
    return this.options.adapters || {};
  }

  get resourceType(): string {
    return getTypePath(this.constructor);
  }

  register(resourceType: any, adapterType: any, newAdapter?: any): () => void {
    const array = Array.isArray(resourceType) ? resourceType : [resourceType];
    newAdapter = newAdapter || adapterType;
    adapterType = this._toPath(adapterType);
    const adapters = this.adapters;
    const registrations = array.map((resourceType) => {
      resourceType = this._toPath(resourceType);
      return adapters.set(resourceType, adapterType, newAdapter);
    });
    return () => {
      for (const r of registrations) r();
    };
  }

  getAdapter<T>(adapterType: any): T | null {
    let adapter: T | null;
    if (this._adaptersInstances.has(adapterType)) {
      adapter = this._adaptersInstances.get(adapterType);
    } else {
      const Adapter = this._getAdapter(this.resourceType, adapterType);
      adapter =
        typeof Adapter === "function"
          ? /^\s*class\s+/.test(Adapter.toString())
            ? new Adapter(this)
            : Adapter(this)
          : Adapter || null;
      this._adaptersInstances.set(adapterType, adapter);
    }
    return adapter;
  }

  requireAdapter<T>(adapterType: any): T {
    const adapter = this.getAdapter<T>(adapterType);
    if (adapter === undefined || adapter === null) {
      const typePath =
        typeof adapterType === "function"
          ? getTypePath(adapterType, "/")
          : adapterType;
      throw new Error(
        `No required adapters found for this type of resources. Adapter type: "${typePath}"`,
      );
    }
    return adapter;
  }

  _getAdapter(resourceType: string, adapterType: any): any {
    resourceType = this._toPath(resourceType);
    adapterType = this._toPath(adapterType);
    return this.adapters.get(resourceType, adapterType);
  }

  _toPath(type: any): string {
    return typeof type === "function" ? getTypePath(type, "/") : type;
  }
}
