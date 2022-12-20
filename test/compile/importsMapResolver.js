
import { resolveUrl, concatPath } from "@statewalker/uris";

function newMapping(mapping) {
  mapping = Array.isArray(mapping) ? mapping : Object.entries(mapping);
  const compare = (a, b) => a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0;
  mapping = [...mapping].sort(compare);
  return (p) => {
    if (!p) return p;
    let idx = binarySearch(mapping, [p], compare);
    if (idx < 0) {
      idx = Math.max(0, -(idx + 1) - 1);
    }
    let entry;
    for (let i = idx; !entry && (i >= 0); i--) {
      const e = mapping[i];
      if (e && p.indexOf(e[0]) === 0) {
        entry = e;
      }
    }
    return entry;
  };

  function binarySearch(
    arr,
    val,
    compare = (a, b) => (a > b ? 1 : a < b ? -1 : 0),
  ) {
    let low = 0;
    let high = arr.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const v = compare(arr[mid], val);
      if (v === 0) {
        return mid;
      } else if (v < 0) {
        low = mid + 1;
      } else if (v > 0) {
        high = mid - 1;
      }
    }
    return -(low + 1);
  }
}

export function newUrlResolver({ importMap, importMapUrl }) {
  let entries = Object.entries(importMap.imports || {});
  if (importMapUrl) {
    entries = entries.map(([from, to]) => [from, resolveUrl(importMapUrl, to)]);
  }
  const mapping = newMapping(entries);
  return (ref, url) => {
    let refUrl = ref;
    if(ref[0] !== '.'){
      const entry = mapping(ref);
      if (entry) {
        const from = entry[0];
        const path = ref.substring(from.length);
        if (!path || path[0] === '/' || from[from.length - 1] === '/') {
          refUrl = path ? concatPath(entry[1], path) : entry[1];
        }
      }
    } else {
      refUrl = resolveUrl(url, ref);
    }
    return refUrl;
  }
}
