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

/**
 * Map `fn` over `items` keeping at most `limit` calls in flight at once; results
 * stay in input order. Used to fan out independent LLM calls with a concurrency cap.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
