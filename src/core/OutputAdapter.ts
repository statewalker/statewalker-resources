import { ContentReadAdapter } from "./ContentReadAdapter.ts";
import { ContentWriteAdapter } from "./ContentWriteAdapter.ts";
import { ResourceRepository } from "./Repository.ts";
import { ResourceAdapter } from "./ResourceAdapter.ts";

export class OutputAdapter extends ResourceAdapter {
  async copyTo({
    resolveLink,
    repository,
  }: {
    resolveLink: (url: string) => string | undefined;
    repository: ResourceRepository;
  }) {
    const sourceUrl = this.resource.url;
    const targetUrl = resolveLink(sourceUrl);
    if (!targetUrl) return;
    const reader = this.resource.requireAdapter(ContentReadAdapter);
    const target = await repository.getResource(targetUrl, true);
    const writer = target?.requireAdapter(ContentWriteAdapter);
    await writer?.writeContent(reader.readContent());
  }
}
