import ContentReadAdapter from "./ContentReadAdapter.js";
import ContentWriteAdapter from "./ContentWriteAdapter.js";
import ResourceAdapter from "./ResourceAdapter.js";

export default class OutputAdapter extends ResourceAdapter {
  async copyTo({ resolveLink, repository }) {
    const sourceUrl = this.resource.url;
    const targetUrl = resolveLink(sourceUrl);
    if (!targetUrl) return;
    const reader = this.resource.requireAdapter(ContentReadAdapter);
    const writer = await repository.requireAdapter(targetUrl, ContentWriteAdapter, true);
    await writer.writeContent(reader.readContent());
  }
}
