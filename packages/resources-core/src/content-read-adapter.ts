import { ResourceAdapter } from "./resource-adapter.js";

export class ContentReadAdapter extends ResourceAdapter {
  async exists(): Promise<boolean> {
    const filesApi = this.repository.filesApi;
    const stats = await filesApi.stats(this.path);
    return !!stats;
  }

  async *readContent(): AsyncGenerator<Uint8Array> {
    const filesApi = this.repository.filesApi;
    yield* filesApi.read(this.path);
  }

  async *readText(): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    for await (const block of this.readContent()) {
      const chunk = decoder.decode(block);
      yield chunk;
    }
  }
}
