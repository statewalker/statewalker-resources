/**
 * Group the items of a (sync or async) iterable into arrays of up to `batchSize`.
 * The final batch may be shorter. Used by the per-item builders to process a
 * window of updates in parallel rather than one at a time.
 */
export async function* toBatch<T>(
  input: Iterable<T> | AsyncIterable<T>,
  batchSize = 10,
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of input) {
    batch.push(item);
    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}
