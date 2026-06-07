/**
 * The `wiki://` reference / interchange layer over the bare-path internal URI.
 *
 * Internal URIs are project-relative paths WITHOUT a leading slash and INCLUDING
 * the extension (e.g. `notes/intro.md`); a section anchor appends `#section`.
 * `wiki://` is what gets written into stored artifacts, citations, and cross-wiki
 * links, and is accepted as input to every wiki API method. The authority key of a
 * `wiki://` URI is the target wiki's `Project.projectName`.
 *
 * Canonical stored / citation form is always fully qualified:
 *   wiki://chem-lab/notes/intro.md#overview
 * Accepted INPUT forms (all normalize to the local bare path within a wiki):
 *   wiki://chem-lab/notes/intro.md | wiki:///notes/intro.md | /notes/intro.md | notes/intro.md
 */

/** Kebab key; a leading digit is fine since the key sits in the authority. */
export const WIKI_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface WikiRef {
  /** Wiki key = target `Project.projectName`; `undefined` = local (current wiki). */
  key?: string;
  /** Reserved for future remote wikis; `undefined` for now. */
  host?: string;
  /** Bare internal URI, no leading slash. */
  path: string;
  /** Fragment after `#`, if any. */
  section?: string;
}

export class InvalidWikiPathError extends Error {
  constructor(path: string, reason: string) {
    super(`invalid wiki path "${path}": ${reason}`);
    this.name = "InvalidWikiPathError";
  }
}

export class WikiKeyError extends Error {
  constructor(key: string) {
    super(`invalid wiki key "${key}": must match ${WIKI_KEY_RE}`);
    this.name = "WikiKeyError";
  }
}

export class CrossWikiRefError extends Error {
  constructor(key: string, currentKey: string) {
    super(`cross-wiki reference to "${key}" is not allowed from wiki "${currentKey}"`);
    this.name = "CrossWikiRefError";
  }
}

/** Throw `WikiKeyError` unless `key` is a valid wiki key. */
export function assertWikiKey(key: string): void {
  if (!WIKI_KEY_RE.test(key)) throw new WikiKeyError(key);
}

/** Validate a bare internal URI path (no leading/trailing slash, no `.`/`..`/empty/`#`). */
export function validateWikiPath(path: string): void {
  if (path.length === 0) throw new InvalidWikiPathError(path, "path is empty");
  if (path.startsWith("/")) throw new InvalidWikiPathError(path, "leading slash not allowed");
  if (path.endsWith("/")) throw new InvalidWikiPathError(path, "trailing slash not allowed");
  if (path.includes("//")) throw new InvalidWikiPathError(path, "empty path segment");
  if (path.includes("#")) throw new InvalidWikiPathError(path, "'#' is reserved for fragments");
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new InvalidWikiPathError(path, `forbidden segment "${segment}"`);
    }
  }
}

function splitSection(input: string): { base: string; section?: string } {
  const idx = input.indexOf("#");
  if (idx === -1) return { base: input };
  return { base: input.slice(0, idx), section: input.slice(idx + 1) || undefined };
}

/**
 * Parse any accepted input form into a `WikiRef`. A `wiki://` URI may carry an
 * authority of `key` or `host:key`; an empty authority (`wiki:///path`) and bare
 * paths (`/path`, `path`) are local (no key). The path is validated.
 */
export function parseWikiUri(input: string): WikiRef {
  const { base, section } = splitSection(input.trim());

  if (base.startsWith("wiki://")) {
    const rest = base.slice("wiki://".length);
    const slash = rest.indexOf("/");
    const authority = slash === -1 ? rest : rest.slice(0, slash);
    const rawPath = slash === -1 ? "" : rest.slice(slash + 1);
    let host: string | undefined;
    let key: string | undefined;
    if (authority.length > 0) {
      const colon = authority.indexOf(":");
      if (colon === -1) {
        key = authority;
      } else {
        host = authority.slice(0, colon) || undefined;
        key = authority.slice(colon + 1);
      }
      if (key !== undefined) assertWikiKey(key);
    }
    validateWikiPath(rawPath);
    return { key, host, path: rawPath, section };
  }

  // Bare path (with or without a leading slash) — always local.
  const path = base.replace(/^\/+/, "");
  validateWikiPath(path);
  return { path, section };
}

/**
 * Normalize any input form to a bare local URI (path, plus `#section` if present)
 * against `currentKey`. Throws `CrossWikiRefError` if the input names a foreign wiki.
 */
export function normalizeWikiUri(input: string, currentKey: string): string {
  const ref = parseWikiUri(input);
  if (ref.key !== undefined && ref.key !== currentKey) {
    throw new CrossWikiRefError(ref.key, currentKey);
  }
  return ref.section ? `${ref.path}#${ref.section}` : ref.path;
}

/** True if `input` names a wiki other than `currentKey`. */
export function isCrossWiki(input: string, currentKey: string): boolean {
  const ref = parseWikiUri(input);
  return ref.key !== undefined && ref.key !== currentKey;
}

/** Produce the canonical fully-qualified form `wiki://[host:]key/path#section`. */
export function toCanonical(ref: WikiRef, currentKey: string): string {
  const key = ref.key ?? currentKey;
  assertWikiKey(key);
  validateWikiPath(ref.path);
  const authority = ref.host ? `${ref.host}:${key}` : key;
  const frag = ref.section ? `#${ref.section}` : "";
  return `wiki://${authority}/${ref.path}${frag}`;
}

/** Format a `[[wiki://key/path#section]]` citation. `ref.key` is required. */
export function formatCitation(ref: WikiRef): string {
  if (ref.key === undefined) throw new WikiKeyError("<undefined>");
  return `[[${toCanonical(ref, ref.key)}]]`;
}

/** Parse a `[[wiki://…]]` citation back into a `WikiRef`. */
export function parseCitation(text: string): WikiRef {
  const trimmed = text.trim();
  const inner =
    trimmed.startsWith("[[") && trimmed.endsWith("]]") ? trimmed.slice(2, -2).trim() : trimmed;
  return parseWikiUri(inner);
}
