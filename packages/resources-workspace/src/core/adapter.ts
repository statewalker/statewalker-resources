import type { Adaptable, AdapterType } from "./adaptable.js";

export class Adapter {
  _adaptable: Adaptable;
  options: Record<string, unknown>;

  constructor(adaptable: Adaptable, options?: Record<string, unknown>) {
    this._adaptable = adaptable;
    this.options = options || {};
  }

  getAdapter<T>(type: AdapterType<T>): T | null {
    return this._adaptable.getAdapter<T>(type);
  }

  requireAdapter<T>(type: AdapterType<T>): T {
    return this._adaptable.requireAdapter<T>(type);
  }
}
