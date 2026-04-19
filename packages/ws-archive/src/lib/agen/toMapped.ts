export async function* toMapped<T, R>(
  input: AsyncIterable<T>,
  map: (input: T) => R | Promise<R>,
): AsyncGenerator<R> {
  for await (const entry of input) {
    yield await map(entry);
  }
}
