import type { Adaptable } from "./adaptable.js";

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type Constructor<T> = new (...args: any[]) => T;
export class Adapter {
  _adaptable: Adaptable;
  options: Record<string, unknown>;

  constructor(adaptable: Adaptable, options?: Record<string, unknown>) {
    this._adaptable = adaptable;
    this.options = options || {};
  }

  getAdapter<T>(type: Constructor<T>): T | null {
    return this._adaptable.getAdapter<T>(type);
  }

  requireAdapter<T>(type: Constructor<T>): T {
    return this._adaptable.requireAdapter<T>(type);
  }
}
