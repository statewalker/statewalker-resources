/**
 * Hierarchical adapter registry.
 *
 * Adapters are stored under a `(from, to)` pair of dot-separated (by default) paths.
 * Lookups walk up each path from the most specific prefix to the least specific, so an
 * adapter registered for `("menu", "file")` also answers `("menu.context", "file.text")`
 * unless a more specific entry shadows it.
 *
 */
export class Adapters<T = unknown> {
  readonly separator: string;
  private index: Record<string, Record<string, T>> = {};

  constructor(separator = ".") {
    this.separator = separator;
  }

  /** Register `adapter` under `(from, to)`. Returns a function that removes it. */
  set(from: string, to: string, adapter: T): () => T | undefined {
    const adapters = (this.index[from] ??= {});
    adapters[to] = adapter;
    return () => this.remove(from, to);
  }

  /** The most specific adapter matching `(from, to)`, walking up both paths. */
  get(from: string, to: string, fromExact = false, toExact = false): T | undefined {
    return this._find(from, fromExact, (f) => {
      const adapters = this.index[f];
      if (!adapters) return undefined;
      return this._find(to, toExact, (t) => adapters[t]);
    });
  }

  /** Every matching adapter, ordered from most specific to least specific. */
  getAll(from: string, to: string, fromExact = false, toExact = false): T[] {
    const result: T[] = [];
    this._find<undefined>(from, fromExact, (f) => {
      const adapters = this.index[f];
      if (adapters) {
        this._find<undefined>(to, toExact, (t) => {
          const adapter = adapters[t];
          if (adapter !== undefined) result.push(adapter);
          return undefined;
        });
      }
      return undefined;
    });
    return result;
  }

  /** Remove and return the exact adapter registered under `(from, to)`. */
  remove(from: string, to: string): T | undefined {
    const adapters = this.index[from];
    if (!adapters) return undefined;
    const result = adapters[to];
    delete adapters[to];
    if (!Object.keys(adapters).length) delete this.index[from];
    return result;
  }

  private _find<R>(
    path: string,
    exact: boolean,
    action: (key: string) => R | undefined,
  ): R | undefined {
    let result: R | undefined;
    const parts = path.split(this.separator);
    for (let i = parts.length; i >= 0; i--) {
      result = action(parts.join(this.separator));
      if (result || exact) break;
      parts.pop();
    }
    return result;
  }
}
