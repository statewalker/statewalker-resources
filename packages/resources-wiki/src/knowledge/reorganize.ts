import {
  type BuilderUpdate,
  loggerOf,
  type Project,
  ProjectBuilder,
  type RegisteredBuilder,
  type ResourceRepository,
  SOURCES_REMOVED_SIGNAL,
} from "@statewalker/resources-workspace";
import { type LlmApi, llmOf, wikiConfigOf } from "../llm/index.js";
import { WikiOutlierIndex, WikiTopicIndex } from "./indexes.js";
import { META_REMOVED_TOPICS_SIGNAL, META_SIGNAL } from "./meta.js";
import { WikiPageMeta } from "./page-adapters.js";
import { pageDirPath } from "./page-paths.js";
import { fillCorpusPurpose, REORGANIZER_SYSTEM_PROMPT } from "./prompts.js";
import {
  type ReorganizeAction,
  type ReorganizerInput,
  reorganizeActionsSchema,
  reorganizerInputSchema,
} from "./schemas.js";
import type { ClassReference, DocumentMeta, GlobalOutlier, GlobalTopic } from "./types.js";

export const REORGANIZE_BUILDER_ID = "IndexReorganizer";
export const PRUNE_BUILDER_ID = "IndexPruner";

/** A leftover per-doc topic group (one distinct new key) the LLM must place. */
interface CandidateGroup {
  key: string;
  name: string;
  description: string;
  /** `<uri>#<topicKey>` references this group contributes. */
  refs: string[];
}

/** Document-uri portion of a `<uri>#<topicKey>` reference (or signal uri). */
function refDocUri(refUri: string): string {
  const i = refUri.indexOf("#");
  return i === -1 ? refUri : refUri.slice(0, i);
}

/** Kebab-case slug for a coined global topic key, derived from its name. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "topic"
  );
}

/** Append `refs` to a class's references, skipping uris already present. */
function addRefs(item: { references: ClassReference[] }, refs: string[]): void {
  for (const uri of refs) {
    if (!item.references.some((r) => r.uri === uri)) item.references.push({ uri });
  }
}

/** Strip every reference contributed by `docUris`; keeps now-empty classes. */
function removeDocRefs<T extends { references: ClassReference[] }>(
  items: T[],
  docUris: ReadonlySet<string>,
): T[] {
  return items.map((t) => ({
    ...t,
    references: t.references.filter((r) => !docUris.has(refDocUri(r.uri))),
  }));
}

/** Drop classes with no references and sort by key for a stable artifact. */
function pruneEmptyAndSort<T extends { key: string; references: ClassReference[] }>(
  items: T[],
): T[] {
  return items.filter((t) => t.references.length > 0).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Apply the LLM's reorganize actions to the working topic map, coining a
 * fallback global for any leftover group the actions did not place.
 */
function applyActions(
  byKey: Map<string, GlobalTopic>,
  actions: ReorganizeAction[],
  leftovers: CandidateGroup[],
): void {
  const covered = new Set<string>();
  const coin = (key: string, name: string, description: string, refs: string[]) => {
    const existing = byKey.get(key);
    if (existing) addRefs(existing, refs);
    else byKey.set(key, { key, name, description, references: refs.map((uri) => ({ uri })) });
  };

  for (const action of actions) {
    if (action.kind === "match-existing") {
      const target = byKey.get(action.globalKey);
      if (!target) continue; // unknown key → leave uncovered for fallback coining
      addRefs(target, action.perDocUris);
      for (const r of action.perDocUris) covered.add(r);
    } else if (action.kind === "extend-existing") {
      const target = byKey.get(action.globalKey);
      if (!target) continue;
      const facet = action.descriptionExtension.trim();
      if (facet) target.description = target.description ? `${target.description} ${facet}` : facet;
      addRefs(target, action.perDocUris);
      for (const r of action.perDocUris) covered.add(r);
    } else {
      coin(slugify(action.name), action.name, action.description, action.perDocUris);
      for (const r of action.perDocUris) covered.add(r);
    }
  }

  // Coverage backstop: coin any leftover ref no action placed (mirrors the
  // prompt's promise that the runtime recovers unplaced candidates).
  for (const g of leftovers) {
    const missing = g.refs.filter((r) => !covered.has(r));
    if (missing.length > 0) coin(g.key, g.name, g.description, missing);
  }
}

/** Incrementally fold the touched documents' topics into the existing index. */
async function reorganizeTopics(
  project: Project,
  metas: Map<string, DocumentMeta>,
  touched: ReadonlySet<string>,
  llm: LlmApi,
  model: string,
  system: string,
  generated: string,
): Promise<number> {
  const index = await project.requireAdapter(WikiTopicIndex).read();
  // Strip touched docs' refs but keep now-empty topics so a re-ingest that still
  // declares the same key folds back into the SAME global (stable keys).
  const byKey = new Map<string, GlobalTopic>(
    removeDocRefs(index.topics, touched).map((t) => [
      t.key,
      { ...t, references: [...t.references] },
    ]),
  );

  // Group the touched docs' candidate topics by key.
  const groups = new Map<string, CandidateGroup>();
  for (const [uri, meta] of metas) {
    for (const t of meta.topics) {
      const g = groups.get(t.key) ?? {
        key: t.key,
        name: t.name,
        description: t.description ?? "",
        refs: [],
      };
      if (!g.description && t.description) g.description = t.description;
      g.refs.push(`${uri}#${t.key}`);
      groups.set(t.key, g);
    }
  }

  // Mechanical exact-key pre-merge; whatever doesn't match becomes a leftover.
  const leftovers: CandidateGroup[] = [];
  for (const g of groups.values()) {
    const existing = byKey.get(g.key);
    if (existing) {
      addRefs(existing, g.refs);
      if (!existing.description && g.description) existing.description = g.description;
    } else {
      leftovers.push(g);
    }
  }

  // LLM round — only when there is something to decide: existing topics to match
  // against, or ≥2 leftovers that might be the same new class. A lone leftover
  // against an empty index can only be new, so coin it mechanically.
  let actions: ReorganizeAction[] = [];
  if (leftovers.length > 0 && (byKey.size > 0 || leftovers.length > 1)) {
    const input: ReorganizerInput = {
      existingTopics: [...byKey.values()].map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
      })),
      candidates: leftovers.map((g) => ({
        key: g.key,
        name: g.name,
        description: g.description,
        perDocUris: g.refs,
      })),
    };
    const { output } = await llm.generateObject({
      name: "reorganize-topics",
      description:
        "Place leftover per-document topics into the global topic index: match an existing topic, extend one, or coin a new one.",
      model,
      system,
      input,
      inputSchema: reorganizerInputSchema,
      outputSchema: reorganizeActionsSchema,
    });
    actions = output.actions;
  }
  applyActions(byKey, actions, leftovers);

  const topics = pruneEmptyAndSort([...byKey.values()]);
  await project.requireAdapter(WikiTopicIndex).write({ generated, topics });
  return leftovers.length;
}

/**
 * Incrementally fold the touched documents' outliers into the outlier index.
 * Mechanical only (merge by `globalClass ?? key`); no LLM round.
 */
async function reorganizeOutliers(
  project: Project,
  metas: Map<string, DocumentMeta>,
  touched: ReadonlySet<string>,
  generated: string,
): Promise<void> {
  const index = await project.requireAdapter(WikiOutlierIndex).read();
  const byKey = new Map<string, GlobalOutlier>(
    removeDocRefs(index.outliers, touched).map((o) => [
      o.key,
      { ...o, references: [...o.references] },
    ]),
  );
  for (const [uri, meta] of metas) {
    for (const o of meta.outliers) {
      const key = o.globalClass ?? o.key;
      const g = byKey.get(key) ?? {
        key,
        name: o.name,
        description: o.description ?? "",
        references: [],
      };
      if (!g.description && o.description) g.description = o.description;
      addRefs(g, [`${uri}#${o.key}`]);
      byKey.set(key, g);
    }
  }
  const outliers = pruneEmptyAndSort([...byKey.values()]);
  await project.requireAdapter(WikiOutlierIndex).write({ generated, outliers });
}

/** Read the current meta of every touched document that still exists. */
async function readTouchedMetas(
  project: Project,
  touched: ReadonlySet<string>,
): Promise<Map<string, DocumentMeta>> {
  const metas = new Map<string, DocumentMeta>();
  for (const uri of touched) {
    const resource = await project.getProjectResource(uri);
    const meta = await resource?.getAdapter(WikiPageMeta)?.get();
    if (meta) metas.set(uri, meta);
  }
  return metas;
}

/**
 * The reorganizer: on any meta change, removed declaration, or removed source,
 * drains those updates and folds only the touched documents' topics/outliers
 * into the existing global indexes. Each touched document's prior references are
 * pruned first; topic candidates that don't exact-key-match an existing index
 * topic go through one LLM round (match-existing / extend-existing / new-global)
 * so semantically-equal classes consolidate instead of duplicating.
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
      const log = loggerOf(project, REORGANIZE_BUILDER_ID);
      const llm = llmOf(project);
      const cfg = wikiConfigOf(project);
      const system = fillCorpusPurpose(REORGANIZER_SYSTEM_PROMPT, cfg.corpusPurpose);
      const pending: BuilderUpdate[] = [];
      const touched = new Set<string>();
      for (const signal of inputs) {
        for await (const u of builder.readUpdates({ signal, cell: REORGANIZE_BUILDER_ID })) {
          pending.push(u);
          touched.add(refDocUri(u.uri));
        }
      }
      if (pending.length > 0) {
        // Reorganize first; only then mark the inputs handled, so an interrupted
        // run re-triggers the reorganization rather than silently skipping it.
        const metas = await readTouchedMetas(project, touched);
        const generated = new Date().toISOString();
        const leftovers = await reorganizeTopics(
          project,
          metas,
          touched,
          llm,
          cfg.modelFor("reorganize"),
          system,
          generated,
        );
        await reorganizeOutliers(project, metas, touched, generated);
        log.info("reorganized indexes", { touched: touched.size, leftovers });
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
      const log = loggerOf(project, PRUNE_BUILDER_ID);
      const repository = project.repository as ResourceRepository;
      for await (const u of builder.readUpdates({
        signal: SOURCES_REMOVED_SIGNAL,
        cell: PRUNE_BUILDER_ID,
      })) {
        try {
          log.debug("pruning artifacts", { uri: u.uri });
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
