/**
 * Reads a readable stream and yields its values as an async generator.
 *
 * @template T
 * @param {ReadableStream<T>} stream - The readable stream to read from.
 * @returns {AsyncGenerator<T>} An async generator yielding the values from the stream.
 */
export async function* fromReadableStream<T>(
  stream: ReadableStream<T>,
): AsyncGenerator<T> {
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    yield value;
  }
}
