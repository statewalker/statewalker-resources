import { describe, expect, it } from "vitest";
import { bindLruMethods } from "../../../src/utils/cache-mem/lru.js";
import { newActiveCache } from "../../../src/utils/cache-mem/new-active-cache.js";
import { newCache } from "../../../src/utils/cache-mem/new-cache.js";

const timeout = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

describe("bindLruMethods", () => {
  it("augments the given target object with cache methods", () => {
    const target = {};
    const cache = bindLruMethods<typeof target, string>(target, { max: 2 });
    expect(cache).toBe(target);
    expect(cache.max).toBe(2);
    cache.set("a", "A");
    expect(cache.get("a")).toBe("A");
    expect(cache.size).toBe(1);
    expect(cache.del("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
  });

  it("augments a function so it carries its own cache", () => {
    const fn = bindLruMethods<(key: string) => string, string>((key: string) => key, {});
    fn.set("a", "A");
    expect(fn.get("a")).toBe("A");
    expect(fn("b")).toBe("b");
  });
});

describe("newCache", () => {
  it("memoizes async factory results per key", async () => {
    let calls = 0;
    const get = newCache<string>(async (key) => {
      calls++;
      return `val:${key}`;
    });
    expect(await get("a")).toBe("val:a");
    expect(await get("a")).toBe("val:a");
    expect(calls).toBe(1);
    expect(await get("b")).toBe("val:b");
    expect(calls).toBe(2);
  });

  it("accepts cache params as the first argument", async () => {
    const get = newCache<string>({ max: 1 }, async (key) => key);
    expect(await get("a")).toBe("a");
    expect(get.max).toBe(1);
  });

  it("drops a rejected promise so the next call retries", async () => {
    let calls = 0;
    const get = newCache<string>(async (key) => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return key;
    });
    await expect(get("a")).rejects.toThrow("boom");
    await timeout(0); // let the internal catch handler evict the rejected entry
    expect(await get("a")).toBe("a");
    expect(calls).toBe(2);
  });
});

describe("newActiveCache", () => {
  it("prunes expired entries on a timer; close() stops it", async () => {
    const cache = newActiveCache<string>({ maxAge: 20, pruneTimeout: 10 }, async (key) => key);
    await cache("a");
    expect(cache.size).toBe(1);
    await timeout(60);
    expect(cache.size).toBe(0);
    cache.close();
  });
});
