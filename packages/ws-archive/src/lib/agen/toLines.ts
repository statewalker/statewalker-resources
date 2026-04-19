/**
 * Transforms a stream of text chunks into a stream of lines.
 *
 * @param iterator - An async iterable of strings to be split into lines.
 * @param split - A function that splits a string into an array of lines. Defaults to splitting by newline characters.
 * @returns An async generator that yields lines of text.
 */
export async function* toLines(
  iterator: AsyncIterable<string>,
  split: (str: string) => string[] = (str) => str.split(/\r?\n/),
): AsyncGenerator<string> {
  let buffer: string | undefined;
  for await (const chunk of iterator) {
    buffer = buffer || "";
    buffer += chunk;
    const lines = split(buffer);
    buffer = lines.pop();
    yield* lines;
  }
  if (buffer !== undefined) {
    yield buffer;
  }
}
