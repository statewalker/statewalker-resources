import Adapter from "./Adapter.js";

export default class RepositoryAdapter extends Adapter {
  get repository() { return this._adaptable; }
}
