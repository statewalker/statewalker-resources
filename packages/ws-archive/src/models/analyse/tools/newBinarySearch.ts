export function newBinarySearch<V, K>(compare: (a: V, b: K) => number): (list: V[], item: K) => number {
  return (list: V[], item: K): number => {
    let low = 0;
    let high = list.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const cmp = compare(list[mid], item);
      if (cmp < 0) {
        low = mid + 1;
      } else if (cmp > 0) {
        high = mid - 1;
      } else {
        return mid;
      }
    }
    return -(low + 1);
  };
}
