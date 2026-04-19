import { getDsvLineDelimiter, splitDsv } from "../dsv/index.js";

/**
 * Converts an async iterable of lines into an async iterable of cell arrays.
 * Each line is split into cells based on the provided delimiters.
 *
 * @param {AsyncIterable<string>} lines - The input async iterable of lines.
 * @param {string[]} [delimiters] - An optional array of delimiters to use for splitting the lines.
 * @returns {AsyncIterable<string[]>} An async iterable of cell arrays.
 */
export async function* toCells(
  lines: AsyncIterable<string>,
  delimiters?: string[],
): AsyncIterable<string[]> {
  let delimiter: undefined | string;
  for await (const line of lines) {
    if (!delimiter) {
      delimiter = getDsvLineDelimiter(line, delimiters);
    }
    const { values } = splitDsv(line, delimiter);
    yield values;
  }
}
