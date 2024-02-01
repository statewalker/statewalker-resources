import { FilesApi } from "@statewalker/webrun-files";

export async function writeEntries(
  filesApi: FilesApi,
  index: Record<string, Uint8Array | string> = {}
) {
  for (const [path, data] of Object.entries(index)) {
    let content: Uint8Array[] = [];
    if (typeof data === "string") {
      content = [new TextEncoder().encode(data)];
    } else if (data instanceof Uint8Array) {
      content = [data];
    }
    await filesApi.write(path, content);
  }
}
