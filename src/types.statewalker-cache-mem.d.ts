declare module "@statewalker/cache-mem" {
  
  export type TCacheOptions = {
    max?: number;
    maxAge?: number;
    dispose?: <T = any, R = any>(value: T) => R;
  };

  export interface TCache<T> {
    prune(): void;
    refresh(key: string): void;
    set(key: string, value: T): void;
    del(key: string): void;
    get(key: string): T;
    keys(): string[];
    reset(): void;
    close(): void;
  }

  export class LRU<T> implements TCache<T> {
    constructor(options: TCacheOptions);
  }

  export function bindLruMethods<T, O = any>(
    options: TCacheOptions
  ): TCache<T> & O;

  export function bindLruMethods<T, O = any>(
    obj: O,
    options: TCacheOptions
  ): TCache<T> & O;

  export function newCache<T>(
    cacheParams: TCacheOptions<T>,
    factory: (key: string, ...args: any[]) => T
  ): TCache<T>;

  export type TActiveCacheOptions = TCacheOptions & {
    pruneTimeout?: number;
  };

  export function newActiveCache<T>(
    cacheParams: TActiveCacheOptions<T>,
    factory: (key: string, ...args: any[]) => T
  ): TCache<T>;
}
