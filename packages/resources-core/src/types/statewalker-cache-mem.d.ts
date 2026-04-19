declare module "@statewalker/cache-mem" {
  export interface LruCache<V = unknown> {
    get(key: string): V | undefined;
    set(key: string, value: V): void;
    del(key: string): void;
  }
  export interface LruOptions {
    max?: number;
    maxAge?: number;
    dispose?: (value: unknown) => void;
  }
  export function bindLruMethods<V = unknown>(options: LruOptions): LruCache<V>;
}
