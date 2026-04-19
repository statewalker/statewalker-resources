import type * as aq from "arquero";

export function equalMasks(a: undefined | aq.BitSet, b: undefined | aq.BitSet) {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (a.count() !== b.count()) {
    return false;
  }
  // return true;
  for (let i = 0, len = a._bits.length; i < len; ++i) {
    if (a._bits[i] !== b._bits[i]) {
      return false;
    }
  }
  return true;
  // let i, j;
  // for (
  //   i = a.next(0), j = b.next(0);
  //   i >= 0 && i < n && j >= 0 && j < n && i === j;
  //   i = a.next(i + 1), j = b.next(j + 1)
  // ) {}
  // return j === j;
}
