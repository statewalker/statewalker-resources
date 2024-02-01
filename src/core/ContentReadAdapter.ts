import { ResourceAdapter } from "./ResourceAdapter.ts";

export class ContentReadAdapter extends ResourceAdapter {
  async exists() {
    const filesApi = this.repository.filesApi;
    const stats = await filesApi.stats(this.path);
    return !!stats;
  }

  async *readContent() {
    const filesApi = this.repository.filesApi;
    yield* filesApi.read(this.path);
  }

  async *readText() {
    const decoder = new TextDecoder();
    for await (const block of this.readContent()) {
      const chunk = decoder.decode(block);
      yield chunk;
    }
  }
}
