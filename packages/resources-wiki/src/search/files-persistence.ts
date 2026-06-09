import type { IndexerPersistence, PersistenceEntry } from "@statewalker/indexer-api";
import { concatPath } from "@statewalker/resources-workspace";
import type { FilesApi } from "@statewalker/webrun-files";

/**
 * `IndexerPersistence` over a `FilesApi`: each persistence entry is stored as a
 * file under `dir`, with the entry name (which may contain `/`) used as the
 * relative path. `save` rewrites the full entry set and prunes files no longer
 * present; `load` streams every stored file back as an entry. Tolerates a
 * missing directory (first run) by yielding nothing.
 */
export class FilesIndexerPersistence implements IndexerPersistence {
  constructor(
    private readonly files: FilesApi,
    private readonly dir: string,
  ) {}

  private get base(): string {
    return this.dir.replace(/^\/+|\/+$/g, "");
  }

  private relative(path: string): string | undefined {
    const p = path.replace(/^\/+/, "");
    const base = this.base;
    if (base === "") return p;
    return p.startsWith(`${base}/`) ? p.slice(base.length + 1) : undefined;
  }

  async save(entries: AsyncIterable<PersistenceEntry>): Promise<void> {
    const written = new Set<string>();
    for await (const entry of entries) {
      await this.files.write(concatPath(this.dir, entry.name), entry.content);
      written.add(entry.name);
    }
    // Prune files from a previous save that this one no longer produced.
    for await (const info of this.listFiles()) {
      const rel = this.relative(info.path);
      if (rel && !written.has(rel)) await this.files.remove(info.path);
    }
  }

  async *load(): AsyncIterable<PersistenceEntry> {
    for await (const info of this.listFiles()) {
      const name = this.relative(info.path);
      if (name) yield { name, content: this.files.read(info.path) };
    }
  }

  private async *listFiles(): AsyncIterable<{ path: string }> {
    try {
      for await (const info of this.files.list(this.dir, { recursive: true })) {
        if (info.kind === "file") yield { path: info.path };
      }
    } catch {
      // Directory does not exist yet (nothing persisted) — nothing to yield.
    }
  }
}
