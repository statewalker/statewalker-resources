import { newBinarySearch } from "./newBinarySearch.js";

export class HashIndex<K, V> {

  private index: Record<number, [key: K, value: V][]> = {};

  private hash: (obj: K) => number;

  private compare: (a: K, b: K) => number = (a, b) => a > b ? 1 : a < b ? -1 : 0;

  private binarySearch: (pairs: [key: K, value: V][], key: K) => number;

  constructor(hash: (obj: K) => number, compare?: (a: K, b: K) => number) {
    this.hash = hash;
    if (compare) {
      this.compare = compare;
    }
    this.binarySearch = newBinarySearch<[key: K, value: V], K>(([key1], key2) => this.compare(key1, key2));
  }

  getOrAdd(key: K, newValue: () => V): V {
    const pair = this.getKeyValuePair(key, true) as [key: K, value: V];
    let prevValue = pair[1];
    if (prevValue === undefined) {
      prevValue = pair[1] = newValue();
    }
    return prevValue;
  }

  keys(): K[] {
    const keys: K[] = [];
    for (const pairs of Object.values(this.index)) {
      for (const pair of pairs) {
        keys.push(pair[0]);
      }
    }
    return keys;
  }

  values(): V[] {
    const values: V[] = [];
    for (const pairs of Object.values(this.index)) {
      for (const pair of pairs) {
        values.push(pair[1]);
      }
    }
    return values;
  }

  has(key: K): boolean {
    const pair = this.getKeyValuePair(key, false);
    return !!pair;
  }

  size(): number {
    let size = 0;
    for (const pairs of Object.values(this.index)) {
      size += pairs.length;
    }
    return size;
  }

  entries(): [key: K, value: V][] {
    const entries: [key: K, value: V][] = [];
    for (const pairs of Object.values(this.index)) {
      for (const pair of pairs) {
        entries.push(pair);
      }
    }
    return entries;
  }

  clear() {
    this.index = {};
  }

  add(key: K, value: V): V | undefined {
    const pair = this.getKeyValuePair(key, true) as [key: K, value: V];
    const prevValue = pair[1];
    pair[1] = value;
    return prevValue;
  }

  get(key: K): V | undefined {
    const pair = this.getKeyValuePair(key, false);
    return pair ? pair[1] : undefined;
  }

  del(key: K): V | undefined {
    const hash = this.hash(key);
    const pairs = this.index[hash];
    if (!pairs) {
      return undefined;
    }
    const idx = this.binarySearch(pairs, key);
    if (idx < 0) {
      return undefined;
    }
    const pair = pairs[idx];
    pairs.splice(idx, 1);
    return pair[1];
  }

  private getKeyValuePair(key: K, addIfEmpty = false): undefined | [key: K, value: V] {
    const hash = this.hash(key);
    let pairs = this.index[hash];
    if (!pairs && !addIfEmpty) {
      return undefined;
    }
    if (!pairs) {
      pairs = [];
      this.index[hash] = pairs;
    }
    let pair: [key: K, value: V] | undefined;
    let idx = this.binarySearch(pairs, key);
    if (idx < 0 && !addIfEmpty) {
      return undefined;
    }
    if (idx >= 0) {
      pair = pairs[idx];
    } else {
      idx = -(idx + 1);
      pair = [key, undefined as unknown as V];
      pairs.splice(idx, 0, pair);
    }
    return pair;
  }

}