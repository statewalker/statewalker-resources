import { mapDsvHeader } from "../dsv/index.js";

/**
 * Converts an async iterable of cell arrays into an async iterable of objects.
 * The first row is used as the header to map cell values to object keys.
 *
 * @param {AsyncIterable<string[]>} rows - The input async iterable of cell arrays.
 * @param {Object} [options] - Optional settings for mapping and handling extra fields.
 * @param {Record<string, string>} [options.mapping] - An optional mapping of header names.
 * @param {boolean} [options.ignoreExtraFields] - Whether to ignore extra fields not in the mapping.
 * @returns {AsyncIterable<Record<string, string>>} An async iterable of objects.
 */
export async function* toObjects<T extends Record<string, unknown>>(
  rows: AsyncIterable<string[]>,
  options: {
    mapping?: Record<string, string>;
    fieldPrefix?: string;
    ignoreExtraFields?: boolean;
  } = {},
): AsyncIterable<T> {
  let header: undefined | [string, number][];
  for await (const cells of rows) {
    if (!header) {
      header = mapDsvHeader(cells, {
        fieldPrefix: options.fieldPrefix,
        mapping: options.mapping,
        ignoreExtraFields: options.ignoreExtraFields,
      });
    } else {
      const object: Record<string, string> = {};
      for (const [field, idx] of header) {
        object[field] = cells[idx];
      }
      yield object as T;
    }
  }
}
