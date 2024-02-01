import { Adapters } from "@statewalker/adapters";

export type TAdapterType<T> = { new (...args: any[]): T };

export type TAdapterTypeKey = string;

export interface TAdaptable {
  getAdapter<T>(type: TAdapterType<T>): undefined | T;

  requireAdapter<T>(type: TAdapterType<T>): T;
}

export abstract class Adaptable implements TAdaptable {
  _adaptersInstances: Map<TAdapterType<any>, any> = new Map();

  abstract get adapters(): TAdaptersManager;

  get adapterTypePrefixes(): string[] {
    return [];
  }

  get adapterType(): TAdapterTypeKey {
    const that = this as any;
    if (!that._resourceType) {
      that._resourceType = this.adapters.getAdapterTypeKey(
        ...this.adapterTypePrefixes,
        this.constructor
      );
    }
    return that._resourceType;
  }

  getAdapter<T>(adapterType: TAdapterType<T>): T | undefined {
    let adapter;
    if (this._adaptersInstances.has(adapterType)) {
      adapter = this._adaptersInstances.get(adapterType) as T;
    } else {
      adapter = this._newAdapter(adapterType);
      if (adapter) {
        this._adaptersInstances.set(adapterType, adapter);
      }
    }
    return adapter;
  }

  requireAdapter<T>(adapterType: TAdapterType<T>): T {
    const adapter = this.getAdapter(adapterType);
    if (adapter === undefined || adapter === null) {
      const typePath = this.adapters.getAdapterTypeKey(adapterType);
      throw new Error(
        `No required adapters found for this type of resources. \n` +
          `Adapter type: "${typePath} \n` +
          `Host type: "${this.adapterType}"`
      );
    }
    return adapter;
  }

  _newAdapter<T>(adapterType: TAdapterType<T>): T | undefined {
    const adapterFactory = this.adapters.getAdapterFactory(
      this.adapterType,
      adapterType
    );
    return adapterFactory ? adapterFactory(this) : undefined;
  }
}

export type TypePathSegment = string | object | (new (...args: any[]) => any);

export function newTypePathBuilder(
  separator: string = "/"
): (...types: TypePathSegment[]) => string[] {
  return function getTypePath(...types: TypePathSegment[]): string[] {
    return toPath(types).filter(Boolean);
    function toPath(types: TypePathSegment[]): string[] {
      return types.reduce((path: string[], type: TypePathSegment) => {
        if (type) {
          if (typeof type === "string") {
            path.push(...type.split(separator));
          } else if (typeof type === "function") {
            path.push(type.name);
          }
          path.push(...toPath([Object.getPrototypeOf(type)]));
        }
        return path;
      }, []);
    }
  };
}

export type TAdapterFactory<A = TAdaptable, T = any> = (adaptable: A) => T;

export interface TAdaptersManager {
  registerAdapterFactory<A = TAdaptable, T = any, N = TAdaptable>(
    from: TAdapterTypeKey | TAdapterType<A>,
    to: TAdapterType<T>,
    newAdapter?: TAdapterFactory<N, T>
  ): () => void;

  getAdapterFactory<A = TAdaptable, T = any>(
    from: TAdapterTypeKey | TAdapterType<A>,
    to: TAdapterType<T>
  ): TAdapterFactory<A, T> | undefined;

  getAdapterTypeKey<T>(
    ...types: (object | TAdapterTypeKey | TAdapterType<T>)[]
  ): TAdapterTypeKey;
}

export class AdaptersManager implements TAdaptersManager {
  adapters: Adapters<TAdapterFactory>;

  getTypePath: (
    ...types: (object | TAdapterTypeKey | TAdapterType<any>)[]
  ) => string[];

  constructor() {
    this.adapters = this._newAdapters();
    this.getTypePath = newTypePathBuilder(this.pathSeparator);
  }

  get pathSeparator() {
    return "/";
  }

  _newAdapters() {
    return new Adapters<TAdapterFactory>(this.pathSeparator);
  }

  registerAdapterFactory<A = TAdaptable, T = any, N = TAdaptable>(
    from: TAdapterTypeKey | TAdapterType<A>,
    to: TAdapterType<T>,
    newAdapter?: TAdapterFactory<N, T>
  ): () => void {
    const fromKey = this.getAdapterTypeKey(from);
    const toKey = this.getAdapterTypeKey(to);
    if (newAdapter === undefined) {
      const Type = to;
      newAdapter = (adaptable: N) => new Type(adaptable);
    }
    return this.adapters.set(fromKey, toKey, newAdapter as TAdapterFactory);
  }

  getAdapterFactory<A = TAdaptable, T = any>(
    from: TAdapterTypeKey | TAdapterType<A>,
    to: TAdapterType<T>
  ): TAdapterFactory<A, T> | undefined {
    const toKey = this.getAdapterTypeKey(to);
    const separator = this.pathSeparator;
    for (
      let fromPath = this.getTypePath(from);
      fromPath.length > 0;
      fromPath.shift()
    ) {
      const result = this.adapters.get(fromPath.join(separator), toKey) as
        | TAdapterFactory<A, T>
        | undefined;
      if (result) return result;
    }
    return undefined;
  }

  getAdapterTypeKey<T>(
    ...types: (object | TAdapterTypeKey | TAdapterType<T>)[]
  ): TAdapterTypeKey {
    const path = this.getTypePath(...types);
    return path.join(this.pathSeparator);
  }
}
