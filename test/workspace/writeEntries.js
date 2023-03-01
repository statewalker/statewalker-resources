export default async function writeEntries(filesApi, index = {}) {
  for (let [path, content] of Object.entries(index)) {
    if (typeof content === "string") {
      content = [new TextEncoder().encode(content)];
    } else if (content instanceof Uint8Array) {
      content = [content];
    }
    await filesApi.write(path, content);
  }
}