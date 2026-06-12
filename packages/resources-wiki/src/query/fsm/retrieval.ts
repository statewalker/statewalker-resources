import type { Project } from "@statewalker/resources-workspace";
import { WikiOutlierIndex, WikiTopicIndex } from "../../knowledge/indexes.js";
import {
  ResourceTextContentCache,
  WikiPageMeta,
  WikiPageSummary,
} from "../../knowledge/page-adapters.js";
import type { DocumentMeta, GlobalOutlier, GlobalTopic } from "../../knowledge/types.js";
import type { SearchAdapter } from "../../search/index.js";
import { parseWikiUri, toCanonical } from "../../uri/wiki-uri.js";
import type { AnswerTopic, EvidenceSection } from "../progress.js";

/** `${uri}#${sectionKey}` — the dedup identity of an evidence section. */
export function sectionId(uri: string, sectionKey: string): string {
  return `${uri}#${sectionKey}`;
}

/** A per-document topic reached through a selected global class. */
export interface DocTopicCandidate {
  /** `<baseUri>#<per-doc-topic-key>` — the reference uri. */
  uri: string;
  baseUri: string;
  perDocKey: string;
  name: string;
  description?: string;
  brief: string;
  sectionKeys: string[];
}

/** Read the global topic + outlier indexes into key-maps. */
export async function readClassIndexes(
  project: Project,
): Promise<{ topics: Map<string, GlobalTopic>; outliers: Map<string, GlobalOutlier> }> {
  const topics = new Map<string, GlobalTopic>();
  const outliers = new Map<string, GlobalOutlier>();
  for await (const t of project.requireAdapter(WikiTopicIndex).list()) topics.set(t.key, t);
  for await (const o of project.requireAdapter(WikiOutlierIndex).list()) outliers.set(o.key, o);
  return { topics, outliers };
}

/**
 * Resolve selected global classes to their per-document topic candidates.
 * Deduplicates by reference uri; reads each document's meta at most once.
 */
export async function buildDocTopicCandidates(
  project: Project,
  selected: { references: { uri: string }[] }[],
  declsOf: (meta: DocumentMeta) => DocumentMeta["topics"] | DocumentMeta["outliers"],
  metaCache: Map<string, DocumentMeta | undefined>,
): Promise<DocTopicCandidate[]> {
  const byUri = new Map<string, DocTopicCandidate>();
  for (const cls of selected) {
    for (const ref of cls.references) {
      if (byUri.has(ref.uri)) continue;
      const { path: baseUri, section: perDocKey } = parseWikiUri(ref.uri);
      if (!perDocKey) continue;
      if (!metaCache.has(baseUri)) {
        const resource = await project.getProjectResource(baseUri);
        metaCache.set(baseUri, await resource?.requireAdapter(WikiPageMeta).get());
      }
      const meta = metaCache.get(baseUri);
      const decl = meta ? declsOf(meta).find((d) => d.key === perDocKey) : undefined;
      if (!decl) continue;
      byUri.set(ref.uri, {
        uri: ref.uri,
        baseUri,
        perDocKey,
        name: decl.name,
        description: decl.description,
        brief: decl.brief,
        sectionKeys: decl.sectionKeys,
      });
    }
  }
  return [...byUri.values()];
}

/** Mechanical hybrid (FTS + vector) search for one subject prompt → candidate sections. */
export async function hybridSearch(
  search: SearchAdapter,
  subjectPrompt: string,
): Promise<{ uri: string; sectionKey: string }[]> {
  const matches = await search.search({ query: subjectPrompt, modes: ["fts", "vector"] });
  const out: { uri: string; sectionKey: string }[] = [];
  for (const m of matches) {
    for (const s of m.sections) out.push({ uri: m.uri, sectionKey: s.sectionKey });
  }
  return out;
}

/** Build an evidence section from a page's summary + raw text block. */
export async function evidenceFor(
  project: Project,
  uri: string,
  sectionKey: string,
): Promise<EvidenceSection | undefined> {
  const resource = await project.getProjectResource(uri);
  if (!resource) return undefined;
  const summary = await resource.requireAdapter(WikiPageSummary).get();
  const section = summary?.sections.find((s) => s.key === sectionKey);
  if (!section) return undefined;
  const raw = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
  const rawBlock = raw
    .split("\n")
    .slice(section.startLine, section.endLine + 1)
    .join("\n");
  return { uri, sectionKey, title: section.title, summary: section.summary, rawBlock };
}

/**
 * Deduplicate + document-order an evidence pool: group by document, and within a
 * document order sections by their natural order in the page summary. Documents
 * appear in first-seen order; sections from one document stay contiguous.
 */
export async function orderEvidence(
  project: Project,
  evidence: EvidenceSection[],
): Promise<EvidenceSection[]> {
  const byDoc = new Map<string, EvidenceSection[]>();
  for (const e of evidence) {
    const list = byDoc.get(e.uri) ?? [];
    list.push(e);
    byDoc.set(e.uri, list);
  }
  const out: EvidenceSection[] = [];
  for (const [uri, list] of byDoc) {
    const resource = await project.getProjectResource(uri);
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    const order = new Map(summary?.sections.map((s, i) => [s.key, i]) ?? []);
    list.sort((a, b) => (order.get(a.sectionKey) ?? 0) - (order.get(b.sectionKey) ?? 0));
    out.push(...list);
  }
  return out;
}

/**
 * Aggregate the topic/outlier classes the retrieved evidence touches: for each
 * evidence page read its `WikiPageMeta`, keep every declared class whose
 * `sectionKeys` intersect the retrieved sections, and cite each covered section
 * as a canonical local reference (`/path#section`). Classes are unioned across pages by key.
 */
export async function aggregateClasses(
  project: Project,
  evidence: EvidenceSection[],
): Promise<{ topics: AnswerTopic[]; outliers: AnswerTopic[] }> {
  const key = project.projectName;
  const sectionsByUri = new Map<string, Set<string>>();
  for (const e of evidence) {
    const set = sectionsByUri.get(e.uri) ?? new Set<string>();
    set.add(e.sectionKey);
    sectionsByUri.set(e.uri, set);
  }

  const topics = new Map<string, AnswerTopic>();
  const outliers = new Map<string, AnswerTopic>();
  const collect = (
    decls: { key: string; name: string; description?: string; sectionKeys: string[] }[],
    uri: string,
    covered: Set<string>,
    target: Map<string, AnswerTopic>,
  ) => {
    for (const d of decls) {
      const hits = d.sectionKeys.filter((sk) => covered.has(sk));
      if (hits.length === 0) continue;
      const agg =
        target.get(d.key) ??
        ({ key: d.key, name: d.name, description: d.description, citations: [] } as AnswerTopic);
      for (const sk of hits)
        agg.citations.push({ uri: toCanonical({ key, path: uri, section: sk }, key) });
      target.set(d.key, agg);
    }
  };

  for (const [uri, covered] of sectionsByUri) {
    const resource = await project.getProjectResource(uri);
    const meta = await resource?.requireAdapter(WikiPageMeta).get();
    if (!meta) continue;
    collect(meta.topics, uri, covered, topics);
    collect(meta.outliers, uri, covered, outliers);
  }
  return { topics: [...topics.values()], outliers: [...outliers.values()] };
}

/**
 * Mechanical citation filter: keep only the claimed citations that resolve to a
 * retrieved `(uri, sectionKey)`; report a caveat when any were dropped.
 */
export function filterCitations(
  evidence: EvidenceSection[],
  claimed: string[],
): { citations: string[]; caveats: string[] } {
  const ids = new Set(evidence.map((e) => sectionId(e.uri, e.sectionKey)));
  const citations = claimed.filter((c) => {
    try {
      const ref = parseWikiUri(c);
      return ref.section !== undefined && ids.has(sectionId(ref.path, ref.section));
    } catch {
      return false;
    }
  });
  const caveats =
    citations.length < claimed.length
      ? ["Some citations did not resolve to retrieved evidence and were dropped."]
      : [];
  return { citations, caveats };
}

/**
 * Render one rolling-summarize fold's input as separate XML tags: the previous
 * rolling summary (omitted on the first fold), the section title, its prior
 * narrative description, and the section's raw content (by line range).
 */
export function renderFoldSection(input: {
  previousSummary?: string;
  marker: string;
  title: string;
  description: string;
  raw: string;
}): string {
  const parts: string[] = [];
  if (input.previousSummary && input.previousSummary.length > 0) {
    parts.push(`<previous_summary>\n${input.previousSummary}\n</previous_summary>`);
  }
  parts.push(`<section_title marker="${input.marker}">\n${input.title}\n</section_title>`);
  parts.push(`<section_description>\n${input.description}\n</section_description>`);
  parts.push(`<raw_content>\n${input.raw}\n</raw_content>`);
  return parts.join("\n");
}

/** A candidate section as offered to the relevance filter (no raw content — title + summary only). */
export interface FilterSection {
  /** The section URI (`<docUri>#<sectionKey>`) the filter echoes back when it keeps the section. */
  uri: string;
  docUri: string;
  docTitle: string;
  title: string;
  summary: string;
}

/** One document's slice of a filter batch: its title plus the candidate sections in that batch. */
export interface FilterDoc {
  docUri: string;
  title: string;
  sections: { uri: string; title: string; summary: string }[];
}

/**
 * Pack doc-grouped candidate sections into batches whose combined size stays under
 * `charBudget` (a token-window proxy at ~4 chars/token). Sections are consumed in the
 * given order, so order by score/document upstream; a document spanning a batch
 * boundary simply repeats its title in each batch.
 */
export function packFilterBatches(sections: FilterSection[], charBudget: number): FilterDoc[][] {
  const batches: FilterDoc[][] = [];
  let cur = new Map<string, FilterDoc>();
  let size = 0;
  const flush = () => {
    if (cur.size > 0) {
      batches.push([...cur.values()]);
      cur = new Map();
      size = 0;
    }
  };
  for (const s of sections) {
    const cost = s.uri.length + s.title.length + s.summary.length + 16;
    if (size > 0 && size + cost > charBudget) flush();
    const doc = cur.get(s.docUri) ?? { docUri: s.docUri, title: s.docTitle, sections: [] };
    doc.sections.push({ uri: s.uri, title: s.title, summary: s.summary });
    cur.set(s.docUri, doc);
    size += cost;
  }
  flush();
  return batches;
}
