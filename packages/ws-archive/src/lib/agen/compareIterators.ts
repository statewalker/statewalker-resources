/**
 * Compares two iterators and calls the provided callbacks for added, removed, and updated items.
 * It assumes that both iterators are ordered and that the `compare` function can be used to determine the order of items.
 * The `compare` function should return:
 *   - `0` if the items are equal,
 *   - a negative number if the first item is less than the second,
 *   - a positive number if the first item is greater than the second.
 * The function iterates through both iterators, comparing items at the current index and calling the appropriate callback functions based on the comparison result.
 *
 * Example usage:
 * ```typescript
 * const firstList = ["A", "B", "C", "D"];
 * const secondList = ["B", "D", "E", "F"];
 * const [added, updated, removed] = compareIterators({
 *  getFirst: (i) => firstList[i],
 *  getSecond: (j) => secondList[j],
 *  firstLen: firstList.length,
 *  secondLen: secondList.length,
 *  compare: (a, b) => a.localeCompare(b),
 *  onAdd: (item) => console.log(`Added: ${item}`),
 *  onRemove: (item) => console.log(`Removed: ${item}`),
 *  onUpdate: (first, second) => console.log(`Updated: ${first} -> ${second}`),
 * });
 * console.log(`Resume: [Added: ${added}, Updated: ${updated}, Removed: ${removed}]`);
 * // Output:
 * Removed: A
 * Updated: B -> B
 * Removed: C
 * Updated: D -> D
 * Added: E
 * Added: F
 * Resume: [Added: 2, Updated: 2, Removed: 2]
 * ```
 * @param T - The type of items in the iterators.
 * @param options - The options for comparing the iterators.
 * @param options.getFirst - A function to get the item from the first iterator by index.
 * @param options.getSecond - A function to get the item from the second iterator by index.
 * @param options.firstLen - The length of the first iterator.
 * @param options.secondLen - The length of the second iterator.
 * @param options.compare - A function to compare two items from the iterators.
 * @param options.onAdd - A callback function to call when an item is added in the second iterator.
 * @param options.onRemove - A callback function to call when an item is removed from the first iterator.
 * @param options.onUpdate - A callback function to call when an item is updated in both iterators.
 * @returns A tuple containing the counts of added, updated, and removed items.
 */

export function compareIterators<T>(
  {
    getFirst,
    getSecond,
    firstLen,
    secondLen,
    compare = (a, b) => a > b ? 1 : a < b ? -1 : 0,
    onAdd = () => { },
    onRemove = () => { },
    onUpdate = () => { },
  }: {
    getFirst: (idx: number) => T;
    getSecond: (idx: number) => T;
    firstLen: number;
    secondLen: number;
    compare?: (a: T, b: T, idxA: number, idxB: number) => number,
    onAdd?: (value: T) => void;
    onRemove?: (value: T) => void;
    onUpdate?: (first: T, second: T) => void;
  }
): [
    added: number,
    updated: number,
    removed: number
  ] {

  let added = 0;
  let updated = 0;
  let removed = 0;
  for (let i = 0, j = 0; i < firstLen || j < secondLen;) {
    if (i >= firstLen) {
      for (; j < secondLen; j++) {
        added++;
        onAdd(getSecond(j));
      }
      break;
    }
    if (j >= secondLen) {
      for (; i < firstLen; i++) {
        removed++;
        onRemove(getFirst(i));
      }
      break;
    }
    const a = getFirst(i);
    const b = getSecond(j);
    const compareResult = compare(a, b, i, j);
    if (compareResult === 0) {
      updated++;
      onUpdate(a, b)
      i++;
      j++;
    } else if (compareResult < 0) {
      removed++;
      onRemove(a);
      i++;
    } else if (compareResult > 0) {
      added++;
      onAdd(b);
      j++;
    } else {
      // Handle unexpected case
      throw new Error(`Unexpected comparison result: ${compareResult}`);
    }
  }
  return [added, updated, removed];
}
