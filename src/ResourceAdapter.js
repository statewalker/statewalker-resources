import { Adapter } from "./Adapter.js";

export default class ResourceAdapter extends Adapter {
  get resource() { return this._adaptable; }
  get repository() { return this.resource.repository; }
  get url() { return this.resource.url; }
}