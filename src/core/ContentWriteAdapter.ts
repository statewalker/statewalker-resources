import { ResourceAdapter } from "./ResourceAdapter.ts";

export class ContentWriteAdapter extends ResourceAdapter {
  async writeContent(content: AsyncGenerator<Uint8Array>) {
    const path = this.resource.path;
    const filesApi = this.repository.filesApi;
    await filesApi.write(path, content);
  }

  async writeText(
    content:
      | Uint8Array
      | string
      | string[]
      | AsyncGenerator<string | Uint8Array>
  ) {
    const encoder = new TextEncoder();
    const it = (async function* (): AsyncGenerator<Uint8Array> {
      if (typeof content === "string") {
        yield encoder.encode(content);
      } else if (Array.isArray(content)) {
        for (const chunk of content) {
          if (typeof chunk === "string") yield encoder.encode(chunk);
          else yield chunk as Uint8Array;
        }
      } else {
        if (content instanceof Uint8Array) yield content;
        else yield* content as AsyncGenerator<Uint8Array>;
      }
    })();
    await this.writeContent(it);
  }
}
