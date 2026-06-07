import { Adapter } from "./adapter.js";
import type { ResourceRepository } from "./repository.js";

export class RepositoryAdapter extends Adapter {
  get repository(): ResourceRepository {
    return this._adaptable as ResourceRepository;
  }
}
