import {
  type BuilderUpdate,
  type Project,
  ProjectBuilder,
  type RegisteredBuilder,
  type ResourceRepository,
  SOURCES_REMOVED_SIGNAL,
} from "@statewalker/resources-workspace";
import { WikiOutlierIndex, WikiTopicIndex } from "./indexes.js";
import { META_REMOVED_TOPICS_SIGNAL, META_SIGNAL } from "./meta.js";
import { WikiPageMeta } from "./page-adapters.js";
import { pageDirPath, resourceUri } from "./page-paths.js";
import type { GlobalOutlier, GlobalTopic } from "./types.js";

export const REORGANIZE_BUILDER_ID = "IndexReorganizer";
export const PRUNE_BUILDER_ID = "IndexPruner";

/** True for a project source resource (not a system-folder/dot-segment artifact). */
function isSource(uri: string): boolean {
  return uri.length > 0 && !uri.split("/").some((seg) => seg.startsWith("."));
}

/** Rebuild the global topic/outlier indexes deterministically from existing pages' meta. */
async function rebuildIndexes(project: Project): Promise<void> {
  const repository = project.repository as ResourceRepository;
  const topics = new Map<string, GlobalTopic>();
  const outliers = new Map<string, GlobalOutlier>();

  for await (const resource of repository.getResources(project.path, true)) {
    if (!isSource(resourceUri(resource))) continue;
    const meta = await resource.getAdapter(WikiPageMeta)?.get();
    if (!meta) continue;
    for (const t of meta.topics) {
      const g =
        topics.get(t.key) ??
        ({
          key: t.key,
          name: t.name,
          description: t.description ?? "",
          references: [],
        } as GlobalTopic);
      if (!g.description && t.description) g.description = t.description;
      // Reference the per-document topic (`<uri>#<topicKey>`), not just the document,
      // so a global topic links back to each source's specific declaration.
      g.references.push({ uri: `${meta.uri}#${t.key}` });
      topics.set(t.key, g);
    }
    for (const o of meta.outliers) {
      // Merge outliers the extractor tagged with a shared global class.
      const key = o.globalClass ?? o.key;
      const g =
        outliers.get(key) ??
        ({
          key,
          name: o.name,
          description: o.description ?? "",
          references: [],
        } as GlobalOutlier);
      if (!g.description && o.description) g.description = o.description;
      g.references.push({ uri: `${meta.uri}#${o.key}` });
      outliers.set(key, g);
    }
  }

  const generated = new Date().toISOString();
  await project.requireAdapter(WikiTopicIndex).write({ generated, topics: [...topics.values()] });
  await project
    .requireAdapter(WikiOutlierIndex)
    .write({ generated, outliers: [...outliers.values()] });
}

/**
 * The reorganizer: on any meta change, removed declaration, or removed source,
 * drains those updates and rebuilds the global topic/outlier indexes from the
 * current existing-source page metas. Because the rebuild reads only existing
 * sources, removed sources' references are pruned automatically.
 */
export function reorganizeBuilder(): RegisteredBuilder {
  const inputs = [META_SIGNAL, META_REMOVED_TOPICS_SIGNAL, SOURCES_REMOVED_SIGNAL];
  return {
    id: REORGANIZE_BUILDER_ID,
    inputs,
    outputs: [],
    // biome-ignore lint/correctness/useYield: rebuilds a global artifact; emits no signal
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const pending: BuilderUpdate[] = [];
      for (const signal of inputs) {
        for await (const u of builder.readUpdates({ signal, cell: REORGANIZE_BUILDER_ID })) {
          pending.push(u);
        }
      }
      if (pending.length > 0) {
        // Rebuild first; only then mark the inputs handled, so an interrupted run
        // re-triggers the rebuild rather than silently skipping it.
        await rebuildIndexes(project);
        for (const u of pending) await u.handled();
      }
      await builder.yieldControl();
      return true;
    },
  };
}

/**
 * The pruner: on source removal, deletes that source's orphaned per-page artifact
 * directory under the project system folder.
 */
export function pruneBuilder(): RegisteredBuilder {
  return {
    id: PRUNE_BUILDER_ID,
    inputs: [SOURCES_REMOVED_SIGNAL],
    outputs: [],
    // biome-ignore lint/correctness/useYield: deletes artifacts; emits no signal
    async *handler(project) {
      const builder = project.requireAdapter(ProjectBuilder);
      const repository = project.repository as ResourceRepository;
      for await (const u of builder.readUpdates({
        signal: SOURCES_REMOVED_SIGNAL,
        cell: PRUNE_BUILDER_ID,
      })) {
        try {
          await repository.filesApi.remove(pageDirPath(project.resource, u.uri));
        } catch {
          // already gone — fine
        }
        await u.handled();
        if (!(await builder.yieldControl())) return false;
      }
      return true;
    },
  };
}
