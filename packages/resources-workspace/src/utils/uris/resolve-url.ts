import { parseUri, resolveUris, serializeUri, type Uri } from "./uri.js";

/** Resolve `urls` left-to-right against each other, returning the final URL string. */
export function resolveUrl(...urls: (string | Uri)[]): string {
  const parsed = ["", ...urls].map(parseUri);
  return serializeUri(resolveUris(parsed[0], ...parsed.slice(1)));
}
