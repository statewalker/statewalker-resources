import { makeRelativeUri, parseUri, serializeUri, type Uri } from "./uri.js";

/** Express `to` relative to `from`, returning the relative URI string. */
export function makeRelative(...uris: (string | Uri)[]): string {
  const parsed = uris.map(parseUri);
  return serializeUri(makeRelativeUri(parsed[0], parsed[1]));
}
