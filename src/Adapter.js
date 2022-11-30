export class Adapter {

  constructor(adaptable, options) {
    this._adaptable = adaptable;
    this.options = options;
  }

  getAdapter(type) {
    return this._adaptable.getAdapter(type);
  }

  requireAdapter(type) {
    return this._adaptable.requireAdapter(type);
  }

}
