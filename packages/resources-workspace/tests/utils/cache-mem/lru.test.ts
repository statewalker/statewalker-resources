import { describe, expect, it } from "vitest";
import { LRU } from "../../../src/utils/cache-mem/lru.js";

const timeout = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

describe("LRU", () => {
  it("basic", () => {
    const cache = new LRU<string>({ max: 10 });
    cache.set("key", "value");
    expect(cache.get("key")).toEqual("value");
    expect(cache.get("nada")).toBe(undefined);
    expect(cache.size).toBe(1);
    expect(cache.max).toBe(10);

    cache.del("key");
    expect(cache.get("key")).toBe(undefined);
    expect(cache.get("nada")).toBe(undefined);
    expect(cache.size).toBe(0);
  });

  it("least recently set", () => {
    const cache = new LRU<string>({ max: 2 });
    expect(cache.max).toBe(2);
    expect(cache.size).toBe(0);
    cache.set("a", "A");
    expect(cache.size).toBe(1);
    cache.set("b", "B");
    expect(cache.size).toBe(2);
    cache.set("c", "C");
    expect(cache.size).toBe(2);
    expect(cache.get("c")).toEqual("C");
    expect(cache.get("b")).toEqual("B");
    expect(cache.get("a")).toBe(undefined);
  });

  it("lru recently gotten", async () => {
    const cache = new LRU<string>({ max: 2 });
    cache.set("a", "A");
    cache.set("b", "B");
    await timeout(30);
    cache.get("a");
    cache.set("c", "C");
    expect(cache.get("c")).toEqual("C");
    expect(cache.get("b")).toBe(undefined);
    expect(cache.get("a")).toBe("A");
  });

  it("del", () => {
    const cache = new LRU<string>({ max: 2 });
    expect(cache.size).toBe(0);
    cache.set("a", "A");
    expect(cache.size).toBe(1);
    expect(cache.del("a")).toBe(true);
    expect(cache.del("a")).toBe(false);
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBe(undefined);
  });

  it("reset", () => {
    const cache = new LRU<string>({ max: 10 });
    cache.set("a", "A");
    cache.set("b", "B");
    cache.reset();
    expect(cache.size).toBe(0);
    expect(cache.max).toBe(10);
    expect(cache.get("a")).toBe(undefined);
    expect(cache.get("b")).toBe(undefined);
  });

  it("keys() lists the live keys", () => {
    const cache = new LRU<string>({ max: 10 });
    cache.set("a", "A");
    cache.set("b", "B");
    expect(cache.keys().sort()).toEqual(["a", "b"]);
  });

  it("dispose is called for evicted and removed entries", () => {
    const disposed: [string, string][] = [];
    const cache = new LRU<string>({ max: 1, dispose: (k, v) => disposed.push([k, v]) });
    cache.set("a", "A");
    cache.set("b", "B"); // evicts "a"
    cache.del("b");
    expect(disposed).toEqual([
      ["a", "A"],
      ["b", "B"],
    ]);
  });

  it("close() empties the cache", () => {
    const cache = new LRU<string>({ max: 10 });
    cache.set("a", "A");
    cache.close();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBe(undefined);
  });

  it("drops items older than maxAge", async () => {
    const n = 30;
    const cache = new LRU<string>({ max: 5, maxAge: n * 2 });

    cache.set("a", "A");
    await timeout(n);

    cache.set("b", "B");
    expect(cache.get("a")).toEqual("A");
    expect(cache.get("b")).toEqual("B");

    await timeout(n * 3);
    cache.set("c", "C");
    expect(cache.get("a")).toBe(undefined);
    expect(cache.get("b")).toBe(undefined);
    expect(cache.get("c")).toEqual("C");
  });

  it("manual pruning", async () => {
    const cache = new LRU<string>({ max: 5, maxAge: 50 });
    cache.set("a", "A");
    cache.set("b", "B");
    cache.set("c", "C");

    await timeout(100);
    expect(cache.size).toEqual(3);
    cache.prune();
    expect(cache.size).toEqual(0);
    expect(cache.get("a")).toBe(undefined);
  });
});
