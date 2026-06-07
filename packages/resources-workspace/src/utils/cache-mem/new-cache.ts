import { bindLruMethods, type LruCache, type LruOptions } from "./lru.js";

/** Produces (or fetches) the value for a key; may be async. */
export type CacheFactory<V, A extends unknown[] = []> = (key: string, ...args: A) => V | Promise<V>;

/** A callable memoizer: call it to get-or-create, plus the full {@link LruCache} surface. */
export type Cache<V, A extends unknown[] = []> = ((key: string, ...args: A) => Promise<V>) &
  LruCache<Promise<V>>;

/**
 * Build a promise-caching memoizer around `factory`. Calling the returned function returns
 * a cached promise per key; rejected promises are dropped so the next call retries.
 *
 */
export function newCache<V, A extends unknown[] = []>(factory: CacheFactory<V, A>): Cache<V, A>;
export function newCache<V, A extends unknown[] = []>(
  cacheParams: LruOptions,
  factory: CacheFactory<V, A>,
): Cache<V, A>;
export function newCache<V, A extends unknown[] = []>(
  cacheParams: LruOptions | CacheFactory<V, A>,
  factory?: CacheFactory<V, A>,
): Cache<V, A> {
  let create: CacheFactory<V, A>;
  let params: LruOptions;
  if (!factory) {
    create = cacheParams as CacheFactory<V, A>;
    params = {};
  } else {
    create = factory;
    params = cacheParams as LruOptions;
  }
  const options: LruOptions<string, Promise<V>> = {
    max: params.max ?? 1000,
    maxAge: params.maxAge ?? 1000 * 60 * 60,
    dispose: params.dispose,
  };

  const cache: Cache<V, A> = bindLruMethods<(key: string, ...args: A) => Promise<V>, Promise<V>>(
    (key: string, ...args: A): Promise<V> => {
      let promise = cache.get(key);
      if (!promise) {
        promise = Promise.resolve().then(() => create(key, ...args));
        cache.set(key, promise);
        // Drop a rejected promise so a later call retries instead of caching the error.
        void promise.catch(() => cache.del(key));
      }
      return promise;
    },
    options,
  );
  return cache;
}
