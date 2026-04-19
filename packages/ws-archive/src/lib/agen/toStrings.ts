/**
 * Decodes a stream of Uint8Array into a stream of strings using TextDecoder.
 *
 * @param iterator - An async iterable of Uint8Array to be decoded.
 * @returns An async generator that yields decoded strings.
 */

export async function* toStrings(
  iterator: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  for await (const block of iterator) {
    yield decoder.decode(block);
  }
}
