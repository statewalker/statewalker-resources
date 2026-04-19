import { replaceHeaderLine } from "./replaceHeaderLine.js";
import { toCells } from "./toCells.js";
import { toObjects } from "./toObjects.js";

export async function* readObjects(
  lines: AsyncIterable<string>,
  {
    mapping,
    fieldPrefix = "field_",
  }: { mapping?: Record<string, string>; fieldPrefix?: string } = {},
) {
  const linesWithNewHeader = replaceHeaderLine(lines, {
    fieldPrefix,
    mapping,
  });
  const rows = toCells(linesWithNewHeader);
  const objects = toObjects(rows);
  yield* objects;
}
