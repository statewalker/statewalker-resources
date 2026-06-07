import { type Adapters, getTypePath } from "../utils/index.js";

/**
 * A class usable as an adapter type. Instances are constructed with their host adaptable;
 * the signature is intentionally permissive so any class can also serve as a nominal
 * resource-type key (e.g. `register(ResourceRepository, Workspace)`).
 */
export type AdapterConstructor<T> = new (...args: any[]) => T;

/** A key identifying an adapter or resource type: a string (e.g. a mime type) or a class. */
export type AdapterType<T = unknown> = string | AdapterConstructor<T>;

/** A registered adapter entry: a class, a factory, or a ready value. */
type AdapterEntry<T> = AdapterConstructor<T> | ((adaptable: Adaptable) => T) | T;

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
    return this.options.adapters ?? ({} as Adapters);
  }

  get resourceType(): string {
    return getTypePath(this.constructor);
  }

  register(
    resourceType: AdapterType | AdapterType[],
    adapterType: AdapterType,
    newAdapter?: AdapterEntry<unknown>,
  ): () => void {
    const array = Array.isArray(resourceType) ? resourceType : [resourceType];
    const entry = newAdapter ?? adapterType;
    const adapterPath = this._toPath(adapterType);
    const adapters = this.adapters;
    const registrations = array.map((rt) => adapters.set(this._toPath(rt), adapterPath, entry));
    return () => {
      for (const r of registrations) r();
    };
  }

  getAdapter<T>(adapterType: AdapterType<T>): T | null {
    if (this._adaptersInstances.has(adapterType)) {
      return this._adaptersInstances.get(adapterType) as T | null;
    }
    const entry = this._getAdapter(this.resourceType, adapterType) as AdapterEntry<T> | undefined;
    let adapter: T | null;
    if (typeof entry === "function") {
      adapter = /^\s*class\s+/.test(entry.toString())
        ? new (entry as AdapterConstructor<T>)(this)
        : (entry as (adaptable: Adaptable) => T)(this);
    } else {
      adapter = (entry as T | undefined) ?? null;
    }
    this._adaptersInstances.set(adapterType, adapter);
    return adapter;
  }

  requireAdapter<T>(adapterType: AdapterType<T>): T {
    const adapter = this.getAdapter<T>(adapterType);
    if (adapter === undefined || adapter === null) {
      const typePath =
        typeof adapterType === "function" ? getTypePath(adapterType, "/") : adapterType;
      throw new Error(
        `No required adapters found for this type of resources. Adapter type: "${typePath}"`,
      );
    }
    return adapter;
  }

  _getAdapter(resourceType: string, adapterType: AdapterType): unknown {
    return this.adapters.get(this._toPath(resourceType), this._toPath(adapterType));
  }

  _toPath(type: AdapterType): string {
    return typeof type === "function" ? getTypePath(type, "/") : type;
  }
}
