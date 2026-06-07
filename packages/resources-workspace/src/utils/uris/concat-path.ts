import { joinUri, parseUri, serializeUri, type Uri } from "./uri.js";

/** Join several URIs/paths into a single normalized path string. */
export function concatPath(...uris: (string | Uri)[]): string {
  const parsed = uris.map(parseUri);
  return serializeUri(joinUri(...parsed));
}
