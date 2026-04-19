import { Adapters } from "@statewalker/adapters";
import type { LruCache } from "@statewalker/cache-mem";
import { bindLruMethods } from "@statewalker/cache-mem";
import { getMimeType } from "@statewalker/resources-utils";
import { parseUri } from "@statewalker/uris";
import { normalizePath } from "@statewalker/webrun-files";
import type { AdaptableOptions } from "./adaptable.js";
import { Adaptable } from "./adaptable.js";
import { Resource } from "./resource.js";

export interface FilesApi {
  list(path: string, options?: { recursive?: boolean }): AsyncIterable<{ path: string }>;
  stats(path: string): Promise<any>;
  read(path: string, options?: any): AsyncIterable<Uint8Array>;
  write(
    path: string,
    content: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  ): Promise<void>;
  remove(path: string): Promise<any>;
}

export interface RepositoryOptions extends AdaptableOptions {
  filesApi: FilesApi;
  cacheParams?: {
    max?: number;
    maxAge?: number;
  };
}

export class ResourceRepository extends Adaptable {
  declare options: RepositoryOptions;
  private _cache: LruCache<Promise<Resource | null>>;
  private _adapters: Adapters;

  constructor(options: RepositoryOptions) {
    super(options);
    if (!this.filesApi) throw new Error("FilesApi is not defined");
    this._cache = bindLruMethods<Promise<Resource | null>>({
      ...this.cacheParams,
      dispose(promise) {
        console.log("REMOVE RESOURCE", promise);
      },
    });
    this._adapters = new Adapters("/");
  }

  get filesApi(): FilesApi {
    return this.options.filesApi;
  }

  get cacheParams(): { max: number; maxAge: number } {
    return Object.assign(
      {
        max: 1000,
        maxAge: 1000 * 60 * 60,
      },
      this.options.cacheParams,
    );
  }

  get adapters(): Adapters {
    return this._adapters;
  }

  async *getResources(prefix: string, recursive?: boolean): AsyncGenerator<Resource> {
    const basePath = this._resolvePath(prefix);
    for await (const { path } of this.filesApi.list(basePath, { recursive })) {
      const resource = await this.getResource(path);
      if (resource) yield resource;
    }
  }

  async hasResource(url: string): Promise<boolean> {
    return !!(await this.getResource(url, false));
  }

  async getResource(url: string, create?: boolean): Promise<Resource | null> {
    let resource = await this._cache.get(url);
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
        });
      this._cache.set(url, promise);
      resource = await promise;
    }
    return resource;
  }

  _resolvePath(path: string): string {
    let filePath = parseUri(path).path;
    filePath = normalizePath(filePath);
    return filePath;
  }

  _newResource(url: string): Resource {
    const mimeType = this._getResourceMimeType(url);
    return new Resource({ repository: this, url, mimeType });
  }

  _getResourceMimeType(url: string): string {
    return getMimeType(url);
  }
}
