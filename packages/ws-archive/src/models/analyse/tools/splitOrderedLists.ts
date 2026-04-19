export function splitOrderedLists<T>(
  first: T[],
  second: T[],
  compare: (a: T, b: T) => -1 | 0 | 1 = (a, b) => a > b ? 1 : a < b ? -1 : 0): [
    firstOnly: T[],
    common: T[],
    secondOnly: T[]
  ] {
  const firstOnly: T[] = [];
  const common: T[] = [];
  const secondOnly: T[] = [];
  for (let i = 0, j = 0; i < first.length || j < second.length;) {
    if (i >= first.length) {
      for (; j < second.length; j++) {
        secondOnly.push(second[j]);
      }
      break;
    }
    if (j >= second.length) {
      for (; i < first.length; i++) {
        firstOnly.push(first[i]);
      }
      break;
    }
    const a = first[i];
    const b = second[j];
    const compareResult = compare(a, b);
    if (compareResult === 0) {
      common.push(a);
      i++;
      j++;
    } else if (compareResult < 0) {
      firstOnly.push(a);
      i++;
    } else if (compareResult > 0) {
      secondOnly.push(b);
      j++;
    }
  }
  return [firstOnly, common, secondOnly];
}
