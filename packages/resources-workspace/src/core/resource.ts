import { type Adapters, type ParsedUri, parseUri } from "../utils/index.js";
import { Adaptable } from "./adaptable.js";
import type { ResourceRepository } from "./repository.js";

export interface ResourceOptions {
  repository: ResourceRepository;
  url: string;
  mimeType: string;
  [key: string]: unknown;
}

export class Resource extends Adaptable {
  declare options: ResourceOptions;
  private _urlObj?: ParsedUri;

  constructor(options: ResourceOptions) {
    super(options);
    if (!this.repository) throw new Error("ResourceRepository is not defined.");
    if (this.url === undefined) throw new Error("URL is not defined.");
    if (this.mimeType === undefined) throw new Error("Mime type is not defined.");
  }

  get repository(): ResourceRepository {
    return this.options.repository;
  }

  get adapters(): Adapters {
    return this.repository.adapters;
  }

  get mimeType(): string {
    return this.options.mimeType;
  }

  get resourceType(): string {
    return this.mimeType;
  }

  get url(): string {
    return this.options.url;
  }

  get urlObj(): ParsedUri {
    if (!this._urlObj) {
      this._urlObj = parseUri(this.url);
    }
    return this._urlObj;
  }

  get path(): string {
    return this.urlObj.path;
  }

  async getStats(): Promise<unknown> {
    return (this.repository as ResourceRepository).filesApi.stats(this.path);
  }

  async exists(): Promise<boolean> {
    return !!(await this.getStats());
  }
}
