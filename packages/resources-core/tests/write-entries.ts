import type { FilesApi } from "../src/repository.js";

export async function writeEntries(
  filesApi: FilesApi,
  index: Record<string, string | Uint8Array> = {},
): Promise<void> {
  for (const [path, content] of Object.entries(index)) {
    let data: AsyncIterable<Uint8Array>;
    if (typeof content === "string") {
      const encoded = new TextEncoder().encode(content);
      data = [encoded] as unknown as AsyncIterable<Uint8Array>;
    } else if (content instanceof Uint8Array) {
      data = [content] as unknown as AsyncIterable<Uint8Array>;
    } else {
      data = content;
    }
    await filesApi.write(path, data);
  }
}
