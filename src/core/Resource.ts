// import { getLogger } from "@dynotes/logger";
import { TUri, parseUri } from "@statewalker/uris";
import { Adaptable } from "../adapters/index.ts";
import { ResourceRepository } from "./Repository.ts";

export type ResourceOptions = {
  repository: ResourceRepository;
  url: string;
  mimeType: string;
} & Record<string, any>;

export class Resource extends Adaptable {
  options: ResourceOptions;
  constructor(options: ResourceOptions) {
    super();
    this.options = options;
    if (!this.repository) throw new Error(`ResourceRepository is not defined.`);
    if (this.url === undefined) throw new Error(`URL is not defined.`);
    if (this.mimeType === undefined)
      throw new Error(`Mime type is not defined.`);
  }

  get repository(): ResourceRepository {
    return this.options.repository;
  }

  get adapters() {
    return this.repository.adapters;
  }
  get adapterTypePrefixes() {
    return this.mimeType.split("/").reverse().filter(Boolean);
  }
  get mimeType() {
    return this.options.mimeType || "";
  }
  get url() {
    return this.options.url;
  }
  get urlObj(): TUri {
    const that = this as any;
    if (!that._urlObj) {
      that._urlObj = parseUri(this.url);
    }
    return that._urlObj;
  }
  get path() {
    return this.urlObj.path || "";
  }

  async getStats() {
    return this.repository.filesApi.stats(this.path);
  }

  async exists() {
    return !!(await this.getStats());
  }
}
