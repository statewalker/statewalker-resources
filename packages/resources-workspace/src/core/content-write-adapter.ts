import { ResourceAdapter } from "./resource-adapter.js";

export class ContentWriteAdapter extends ResourceAdapter {
  async writeContent(content: Iterable<Uint8Array> | AsyncIterable<Uint8Array>): Promise<void> {
    const path = this.resource.path;
    const filesApi = this.repository.filesApi;
    await filesApi.write(path, content);
  }

  async writeText(content: string | AsyncIterable<string | Uint8Array>): Promise<void> {
    if (typeof content === "string") {
      content = [content] as unknown as AsyncIterable<string>;
    }
    const encoder = new TextEncoder();
    const it = (async function* () {
      for await (const chunk of content as AsyncIterable<string | Uint8Array>) {
        yield typeof chunk === "string" ? encoder.encode(chunk) : chunk;
      }
    })();
    await this.writeContent(it);
  }
}
