export default class ResourceAdapter {

  static register(repo, resourceType, impl) {
    repo.register(resourceType, this, impl || this);
  }

  constructor(resource) {
    this.resource = resource;
  }

  get repository() { return this.resource.repository; }
  get url() { return this.resource.url; }

  async _clearValue(key) {
    await this.resource._clearValue(key);
  }

  async _getValue(key, newValue) {
    return await this.resource._getValue(key, newValue);
  }

  getAdapter(type) {
    return this.resource.getAdapter(type);
  }

  requireAdapter(type) {
    return this.resource.requireAdapter(type);
  }

}