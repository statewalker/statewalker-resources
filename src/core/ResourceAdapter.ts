import { TAdaptable, TAdapterType } from "src/adapters/index.ts";
import { Resource } from "./Resource.ts";

export class ResourceAdapter implements TAdaptable {
  resource: Resource;

  constructor(resource: Resource) {
    this.resource = resource;
  }

  getAdapter<T>(type: TAdapterType<T>): T | undefined {
    return this.resource.getAdapter(type);
  }

  requireAdapter<T>(type: TAdapterType<T>): T {
    return this.resource.requireAdapter(type);
  }

  get repository() {
    return this.resource.repository;
  }
  get url() {
    return this.resource.url;
  }
  get path() {
    return this.resource.path;
  }
}
