export async function* mapObjectsToLines<T extends Record<string, unknown>>(
  input: AsyncIterable<T>,
  options: {
    fields?: string[];
    delimiter?: string;
  } = {},
) {
  let idx = 0;
  let fields = options.fields;
  for await (const entry of input) {
    if (idx === 0) {
      fields = fields || Object.keys(entry);
    }
    idx++;
    const newLine = (fields || [])
      .map((field) => JSON.stringify(entry[field]))
      .join(options.delimiter || ",");
    yield newLine;
  }
}
