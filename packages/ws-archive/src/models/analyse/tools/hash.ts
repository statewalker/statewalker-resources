
export function hashCodeForNumbers(list: number[]): number {
  return cyrb53(list);
}

export function hashCodeForString(str: string): number {
  return cyrb53(Array.from(str, (ch) => ch.charCodeAt(0)));
}

export function hashCode<T>(getHash: (obj: T) => number, list: Iterable<T>): number {
  return cyrb53(Array.from(list, getHash));
}

export function hashCodeForArray<T>(getHash: (obj: T) => number, list: Iterable<T>): number {
  return cyrb53(Array.from(list, getHash));
}

/*
    cyrb53 (c) 2018 bryc (github.com/bryc)
    A fast and simple hash function with decent collision resistance.
    Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
    Public domain. Attribution appreciated.
*/
// See also: 
// - https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
// - https://gist.github.com/feeedback/e6d137d3f54b1aa0310d690daadfaf28
export function cyrb53(values: Iterable<number>, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (const ch of values) {
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

// /*
//     cyrb53 (c) 2018 bryc (github.com/bryc)
//     A fast and simple hash function with decent collision resistance.
//     Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
//     Public domain. Attribution appreciated.
// */
// // See also: 
// // - https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
// // - https://gist.github.com/feeedback/e6d137d3f54b1aa0310d690daadfaf28
// export function cyrb53(str: string, seed = 0): number {
//   let h1 = 0xdeadbeef ^ seed;
//   let h2 = 0x41c6ce57 ^ seed;
//   for (let i = 0, ch: number; i < str.length; i++) {
//     ch = str.charCodeAt(i);
//     h1 = Math.imul(h1 ^ ch, 2654435761);
//     h2 = Math.imul(h2 ^ ch, 1597334677);
//   }
//   h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
//   h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
//   return 4294967296 * (2097151 & h2) + (h1 >>> 0);
// };