import { splitDsv } from "./splitDsv.js";

/**
 * Determines the best delimiter for a given DSV (Delimiter-Separated Values) line.
 *
 * @param {string} line - The DSV line to analyze.
 * @param {string[]} [delimiters=[";", ",", "|", "\t"]] - An array of possible delimiters to consider.
 * @returns {string} - The delimiter that best separates the values in the line.
 */
export function getDsvLineDelimiter(
  line: string,
  delimiters: string[] = [";", ",", "|", "\t"],
): string {
  // Initialize the maximum length of split values and the best candidate delimiter
  let maxLen = 1;
  let bestCandidate: undefined | string = splitDsv(line).delimiter;

  // Iterate over each possible delimiter
  for (const delimiter of delimiters) {
    // Split the line using the current delimiter
    const result = splitDsv(line, delimiter);
    const len = result.values.length || 0;

    // Update the best candidate if the current delimiter results in more split values
    if (len > maxLen) {
      bestCandidate = result.delimiter;
      maxLen = len;
    }
  }

  // Return the best candidate delimiter or the first delimiter in the list if none found
  return bestCandidate || delimiters[0] || ";";
}
