import { makeRelative } from "./make-relative.js";
import { resolveUrl } from "./resolve-url.js";

export interface PathMappingEntry {
  source: string;
  target: string;
}

export type PathMapping = PathMappingEntry[] | Record<string, string>;

/**
 * Build a function that maps a path under one of the registered `source` prefixes to the
 * corresponding `target` location. Returns `null` when no prefix matches.
 */
export function newPathMapping(mapping: PathMapping): (p: string) => string | null {
  const entries: PathMappingEntry[] = Array.isArray(mapping)
    ? [...mapping]
    : Object.entries(mapping).map(([source, target]) => ({ source, target }));
  const compare = (a: PathMappingEntry, b: PathMappingEntry): number =>
    a.source > b.source ? 1 : a.source < b.source ? -1 : 0;
  entries.sort(compare);

  return (p: string): string | null => {
    if (!p) return p;
    let idx = binarySearch(entries, { source: p, target: "" }, compare);
    if (idx < 0) {
      idx = Math.max(0, -(idx + 1) - 1);
    }
    let entry: PathMappingEntry | undefined;
    for (let i = idx; !entry && i >= 0; i--) {
      const e = entries[i];
      if (e && p.indexOf(e.source) === 0) {
        entry = e;
      }
    }
    if (!entry) return null;
    const path = makeRelative(entry.source, p);
    return resolveUrl(entry.target, path);
  };
}

function binarySearch<T>(arr: T[], val: T, compare: (a: T, b: T) => number): number {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const v = compare(arr[mid], val);
    if (v === 0) return mid;
    if (v < 0) low = mid + 1;
    else high = mid - 1;
  }
  return -(low + 1);
}
