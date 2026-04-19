export async function* toBatch<T>(
  input: AsyncIterable<T>,
  batchSize = 100,
): AsyncGenerator<T[]> {
  let buffer: T[] = [];
  for await (const item of input) {
    buffer.push(item);
    if (buffer.length >= batchSize) {
      yield buffer;
      buffer = [];
    }
  }
  if (buffer.length) {
    yield buffer;
  }
}
