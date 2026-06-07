import { Adapter } from "./adapter.js";
import type { ResourceRepository } from "./repository.js";
import type { Resource } from "./resource.js";

export class ResourceAdapter extends Adapter {
  get resource(): Resource {
    return this._adaptable as Resource;
  }

  get repository(): ResourceRepository {
    return this.resource.repository;
  }

  get url(): string {
    return this.resource.url;
  }

  get path(): string {
    return this.resource.path;
  }
}
