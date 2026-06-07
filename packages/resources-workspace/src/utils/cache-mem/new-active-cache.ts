import type { LruOptions } from "./lru.js";
import { type Cache, type CacheFactory, newCache } from "./new-cache.js";

export interface ActiveCacheOptions extends LruOptions {
  /** Background prune interval in ms. Defaults to `maxAge`, then 60s. */
  pruneTimeout?: number;
}

/**
 * Like {@link newCache}, but prunes on a timer so expired entries are disposed even when
 * the cache is idle. `close()` stops the timer.
 */
export function newActiveCache<V, A extends unknown[] = []>(
  cacheParams: ActiveCacheOptions,
  factory: CacheFactory<V, A>,
): Cache<V, A> {
  const params = cacheParams ?? {};
  const result = newCache<V, A>(params, factory);
  const pruneTimeout = params.pruneTimeout || params.maxAge || 60 * 1000;
  const intervalId = setInterval(() => result.prune(), pruneTimeout);
  const prevClose = result.close;
  result.close = () => {
    clearInterval(intervalId);
    prevClose.call(result);
  };
  return result;
}
