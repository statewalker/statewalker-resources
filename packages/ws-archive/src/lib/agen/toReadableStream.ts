/**
 * Reads a readable stream and yields its values as an async generator.
 *
 * @template T
 * @param {ReadableStream<T>} stream - The readable stream to read from.
 * @returns {AsyncGenerator<T>} An async generator yielding the values from the stream.
 */
export function toReadableStream<T>(
  iterator: AsyncIterable<T>,
): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      (async () => {
        try {
          for await (const value of iterator) {
            controller.enqueue(value);
          }
        } finally {
          controller.close();
        }
      })();
    },
  });
}
