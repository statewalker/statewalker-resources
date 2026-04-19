import { replaceHeaderLine } from "./replaceHeaderLine.js";
import { toLines } from "./toLines.js";
import { toStrings } from "./toStrings.js";

export async function* replaceDsvHeaders(
  iterator: AsyncIterable<Uint8Array>,
  params: {
    mapping?: Record<string, string>;
    fieldPrefix?: string;
  },
): AsyncGenerator<string> {
  const textChunks = toStrings(iterator);
  const lines = toLines(textChunks);
  const linesWithNewHeader = replaceHeaderLine(lines, params);
  for await (const line of linesWithNewHeader) {
    yield `${line}\n`;
  }
}
