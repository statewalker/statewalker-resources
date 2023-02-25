import ResourceAdapter from "./ResourceAdapter.js";

export default class ContentWriteAdapter extends ResourceAdapter {

  async writeContent(content) {
    const path = this.resource.path;
    const filesApi = this.repository.filesApi;
    await filesApi.write(path, content);
  }

  async writeText(content) {
    if (typeof content === 'string') {
      content = [content]
    }
    const encoder = new TextEncoder();
    const it = (async function* () {
      for await (const chunk of content) {
        yield typeof chunk === 'string'
          ? encoder.encode(chunk)
          : chunk;
      }
    })();
    await this.writeContent(it);
  }

}
