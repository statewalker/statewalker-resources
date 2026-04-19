export async function* toFiltered<T>(
  input: AsyncIterable<T>,
  accept: (input: T) => boolean | Promise<boolean>,
): AsyncGenerator<T> {
  for await (const entry of input) {
    if (await accept(entry)) {
      yield entry;
    }
  }
}
