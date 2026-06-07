import { ContentReadAdapter } from "./content-read-adapter.js";
import { ContentWriteAdapter } from "./content-write-adapter.js";
import type { ResourceRepository } from "./repository.js";
import { ResourceAdapter } from "./resource-adapter.js";

export class OutputAdapter extends ResourceAdapter {
  async copyTo({
    resolveLink,
    repository,
  }: {
    resolveLink: (url: string) => string | null;
    repository: ResourceRepository;
  }): Promise<void> {
    const sourceUrl = this.resource.url;
    const targetUrl = resolveLink(sourceUrl);
    if (!targetUrl) return;
    const reader = this.resource.requireAdapter<ContentReadAdapter>(ContentReadAdapter);
    const targetResource = await repository.getResource(targetUrl, true);
    if (!targetResource) return;
    const writer = targetResource.requireAdapter<ContentWriteAdapter>(ContentWriteAdapter);
    await writer.writeContent(reader.readContent());
  }
}
