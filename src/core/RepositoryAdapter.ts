import { TAdaptable, TAdapterType } from "../adapters/index.ts";
import { ResourceRepository } from "./Repository.ts";

export class RepositoryAdapter implements TAdaptable {
  repository: ResourceRepository;
  constructor(repository: ResourceRepository) {
    this.repository = repository;
  }
  getAdapter<T>(type: TAdapterType<T>): T | undefined {
    return this.repository.getAdapter(type);
  }
  requireAdapter<T>(type: TAdapterType<T>): T {
    return this.repository.requireAdapter(type);
  }
}
