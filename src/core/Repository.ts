import { parseUri } from "@statewalker/uris";
import { TCache, TCacheOptions, bindLruMethods } from "@statewalker/cache-mem";
import { FilesApi } from "@statewalker/webrun-files";

import getMimeType from "../../tmp/getMimeType.ts";
import { Resource } from "./Resource.ts";
import {
  Adaptable,
  AdaptersManager,
  TAdapterFactory,
  TAdapterType,
  TAdaptersManager,
} from "../adapters/index.ts";

export type ResourceRepositoryOptions = {
  filesApi: FilesApi;
  cacheParams?: TCacheOptions;
  adapters?: TAdaptersManager;
} & Record<string, any>;

export class ResourceRepository extends Adaptable {
  options: ResourceRepositoryOptions;

  _cache: TCache<Promise<Resource | undefined>>;

  _adapters: TAdaptersManager | undefined;

  constructor(options: ResourceRepositoryOptions) {
    super();
    this.options = options;
    if (!this.filesApi) throw new Error("FilesApi is not defined");
    this._cache = bindLruMethods({
      ...this.cacheParams,
      dispose(promise: Promise<Resource>) {
        console.log("REMOVE RESOURCE", promise);
      },
    } as TCacheOptions);
  }

  get filesApi(): FilesApi {
    return this.options.filesApi;
  }

  get adapters(): TAdaptersManager {
    if (!this._adapters) {
      if (this.options.adapters) {
        this._adapters = this.options.adapters;
      } else {
        this._adapters = new AdaptersManager();
      }
    }
    return this._adapters;
  }

  registerAdapter<T>(
    mimeType: string,
    adapterType: TAdapterType<T>,
    factory?: TAdapterFactory<Resource, T>
  ) {
    const path = mimeType.split("/").reverse().filter(Boolean);
    const from = this.adapters.getAdapterTypeKey(...path, Resource);
    this.adapters.registerAdapterFactory(from, adapterType, factory);
    return this;
  }

  registerRepositoryAdapter<T>(
    adapterType: TAdapterType<T>,
    factory?: TAdapterFactory<ResourceRepository, T>
  ) {
    this.adapters.registerAdapterFactory(
      ResourceRepository,
      adapterType,
      factory
    );
    return this;
  }

  get cacheParams(): TCacheOptions {
    const cacheParams = Object.assign(
      {
        max: 1000,
        maxAge: 1000 * 60 * 60,
      },
      this.options.cacheParams
    );
    return cacheParams;
  }

  async *getResources(
    prefix: string,
    recursive: boolean = false
  ): AsyncGenerator<Resource> {
    const basePath = this._resolvePath(prefix);
    for await (const { path } of this.filesApi.list(basePath, { recursive })) {
      yield await this.requireResource(path);
    }
  }

  async hasResource(url: string): Promise<boolean> {
    return !!(await this.getResource(url, false));
  }

  async requireResource(url: string): Promise<Resource> {
    return this.getResource(url, true) as Promise<Resource>;
  }

  async getResource(
    url: string,
    create: boolean = false
  ): Promise<Resource | undefined> {
    let resource: Resource | undefined = await this._cache.get(url);
    if (!resource) {
      const promise = Promise.resolve()
        .then(async () => {
          const path = this._resolvePath(url);
          const stats = await this.filesApi.stats(path);
          if (!stats && !create) return null;
          return this._newResource(url);
        })
        .catch((err) => {
          const p = this._cache.get(url);
          if (p === promise) this._cache.del(url);
          throw err;
        }) as Promise<Resource | undefined>;
      this._cache.set(url, promise);
      resource = await promise;
    }
    return resource;
  }

  _resolvePath(path: string) {
    let filePath = parseUri(path).path || "";
    filePath = this.filesApi.normalizePath(filePath);
    return filePath;
  }

  _newResource(url: string) {
    const mimeType = this._getResourceMimeType(url);
    return new Resource({ repository: this, url, mimeType });
  }

  _getResourceMimeType(url: string) {
    return getMimeType(url);
  }

  // -----------------------------

  // async getResourceAdapter<T>(
  //   url: string,
  //   type: TAdapterType<T>,
  //   create: boolean = false
  // ): Promise<T | undefined> {
  //   const resource = await this.getResource(url, create);
  //   if (!resource) return undefined;
  //   return resource.getAdapter(type);
  // }

  // async requireResourceAdapter<T>(
  //   url: string,
  //   type: TAdapterType<T>
  // ): Promise<T> {
  //   const resource = (await this.getResource(url, true)) as Resource;
  //   return resource.requireAdapter(type);
  // }
}
