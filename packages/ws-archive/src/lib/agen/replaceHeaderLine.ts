import { getDsvLineDelimiter, mapDsvHeader, splitDsv } from "../dsv/index.js";

/**
 * Asynchronously processes an iterable of strings, replacing the header line based on the provided options.
 *
 * @param {AsyncIterable<string>} lines - An async iterable of strings representing lines of a DSV file.
 * @param {Object} [options] - Options for processing the header.
 * @param {Record<string, string>} [options.mapping] - An optional mapping of original header fields to new header fields.
 * @param {string} [options.fieldPrefix] - An optional prefix to add to each header field.
 * @param {string[]} [options.delimiters] - An optional array of delimiters to consider when splitting the header line.
 *
 * @returns {AsyncGenerator<string>} An async generator that yields lines with the header replaced according to the provided options.
 */

export async function* replaceHeaderLine(
  lines: AsyncIterable<string>,
  options: {
    mapping?: Record<string, string>;
    fieldPrefix?: string;
    delimiters?: string[];
  } = {},
) {
  let idx = 0;
  for await (const line of lines) {
    if (idx === 0) {
      const delimiter = getDsvLineDelimiter(line, options.delimiters || []);
      const { values } = splitDsv(line, delimiter);
      const header = mapDsvHeader(values, {
        fieldPrefix: options.fieldPrefix,
        mapping: options.mapping,
        ignoreExtraFields: false,
      });
      const newLine = header
        .map(([field]) => JSON.stringify(field))
        .join(delimiter);
      yield newLine;
    } else {
      yield line;
    }
    idx++;
  }
}
