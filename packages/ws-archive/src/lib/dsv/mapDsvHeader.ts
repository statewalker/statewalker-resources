/**
 * Maps the headers of a DSV (Delimiter-Separated Values) file according to the provided options.
 *
 * @param {string[]} fields - The array of field names from the DSV header.
 * @param {Object} options - The options for mapping the fields.
 * @param {Function} [options.map] - A custom mapping function that takes a field name and its index, and returns the new field name.
 * @param {Record<string, string>} [options.mapping] - An object that maps original field names to new field names.
 * @param {boolean} [options.ignoreExtraFields] - If true, fields that do not have a corresponding mapping will be ignored.
 * @param {string} [options.fieldPrefix] - A prefix to use for fields that do not have a corresponding mapping.
 * @returns {[string, number][]} An array of tuples where each tuple contains the new field name and its original index.
 */
export function mapDsvHeader(
  fields: string[],
  {
    mapping,
    ignoreExtraFields,
    fieldPrefix,
    map = (field: string, idx: number) => {
      let result = mapping?.[field];
      if (!result && !ignoreExtraFields) {
        result = fieldPrefix ? `${fieldPrefix}${idx}` : field;
      }
      return result;
    },
  }: {
    map?: (field: string, idx: number) => string | undefined;
    mapping?: Record<string, string>;
    ignoreExtraFields?: boolean;
    fieldPrefix?: string;
  },
): [string, number][] {
  const header: [string, number][] = [];
  fields.forEach((field, idx) => {
    const newFieldName = map(field, idx);
    if (newFieldName) {
      header.push([newFieldName, idx]);
    }
  });
  return header;
}
