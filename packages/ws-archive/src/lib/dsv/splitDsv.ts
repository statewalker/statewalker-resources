/**
 * Splits a delimited string value (DSV) into an array of values based on the specified delimiter.
 * If no delimiter is provided, it will infer the delimiter from common delimiters such as
 * semicolon, comma, tab, or pipe.
 *
 * @param {string} line - The input string to be split.
 * @param {string} [delimiter] - The delimiter to use for splitting the string. If not provided,
 *                               the function will infer the delimiter.
 * @returns {{ values: string[], delimiter?: string }} An object containing the array of split values
 *                                                     and the delimiter used.
 */
export function splitDsv(
  line: string,
  initialDelimiter?: string,
): {
  values: string[];
  delimiter?: string;
} {
  let delimiter = initialDelimiter;
  // Initialize an array to hold the split values
  const values: string[] = [];
  // Flag to indicate if the current character is escaped
  let escaped = false;
  // Variable to hold the current quote character if inside a quoted value
  let quot: string | undefined = "";
  // Variable to accumulate the current value being parsed
  let value: string | undefined = "";

  // Iterate over each character in the input line
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (escaped) {
      // If the previous character was an escape character, add the current character to the value
      value = (value || "") + ch;
      escaped = false;
    } else if (ch === "\\") {
      // If the current character is an escape character, set the escaped flag
      escaped = true;
    } else if (quot) {
      // If inside a quoted value
      if (ch === quot) {
        // If the current character matches the quote character, end the quoted value
        value !== undefined && values.push(value);
        value = undefined;
        quot = undefined;
      } else {
        // Otherwise, add the current character to the value
        value = (value || "") + ch;
      }
    } else if (!value && (ch === '"' || ch === "'")) {
      // If the current character is a quote and not currently building a value, start a quoted value
      quot = ch;
      value = "";
    } else if (delimiter && ch === delimiter) {
      // If the current character matches the delimiter, push the current value and reset it
      value !== undefined && values.push(value);
      value = "";
    } else if (
      !delimiter &&
      (ch === ";" || ch === "," || ch === "\t" || ch === "|")
    ) {
      // If no delimiter is set and the current character is a common delimiter, set the delimiter and push the current value
      delimiter = ch;
      value !== undefined && values.push(value);
      value = "";
    } else if (ch === " ") {
      // If the current character is a space, add it to the current value
      if (value !== undefined) {
        value += ch;
      }
    } else {
      // Otherwise, add the current character to the current value
      value = (value || "") + ch;
    }
  }

  // Push the last value if it exists
  value !== undefined && values.push(value);

  // Return the split values and the delimiter used
  return { values, delimiter };
}
