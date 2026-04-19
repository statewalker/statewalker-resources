export function compareOrderedLists<T>(
  first: T[],
  second: T[],
  compare: (a: T, b: T) => -1 | 0 | 1 = (a, b) => a > b ? 1 : a < b ? -1 : 0,
): [added: number, common: number, removed: number] {
  let added = 0;
  let common = 0;
  let removed = 0;
  for (let i = 0, j = 0; i < first.length || j < second.length;) {
    if (i >= first.length) {
      for (; j < second.length; j++) {
        added++;
      }
      break;
    }
    if (j >= second.length) {
      for (; i < first.length; i++) {
        removed++;
      }
      break;
    }
    const a = first[i];
    const b = second[j];
    const compareResult = compare(a, b);
    if (compareResult === 0) {
      common++;
      i++;
      j++;
    } else if (compareResult < 0) {
      removed++;
      i++;
    } else if (compareResult > 0) {
      added++;
      j++;
    }
  }
  return [added, common, removed];
}
