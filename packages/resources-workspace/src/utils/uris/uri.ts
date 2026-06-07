/**
 * URI parsing, serialization, resolution, and relativization.
 *
 * A URI is decomposed into
 * `{ schema, domain, path, query, fragment }`; all operations work on that structure.
 */

export type Query = Record<string, string | string[]>;

export interface Uri {
  schema: string;
  domain: string;
  path: string;
  query: Query;
  fragment: string;
}

/** Result of {@link parseUri}; alias kept for backwards compatibility. */
export type ParsedUri = Uri;

export function decodeQueryComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export function encodeQueryComponent(str: string): string {
  try {
    return encodeURIComponent(str);
  } catch {
    return str;
  }
}

export function parseQuery(query: string, decode = decodeQueryComponent): Query {
  const result: Query = {};
  for (const entry of query.split("&")) {
    const pair = entry.split("=");
    const key = decode(pair[0]);
    let value: string | string[] = decode(pair[1]);
    const prevValue = result[key];
    if (prevValue !== undefined) {
      const array = Array.isArray(prevValue) ? prevValue : [prevValue];
      array.push(value as string);
      value = array;
    }
    result[key] = value;
  }
  return result;
}

export function parseUri(uri: string | Uri): Uri {
  if (typeof uri === "object") return uri;
  const str = `${uri ?? ""}`;
  let schema = "";
  let domain = "";
  let path = "";
  let query: Query = {};
  let fragment = "";
  str.replace(
    /^((\S*?):)?(\/\/([\d\w][^/]*)?)?(\/?[^#?]*?)(\?[^#]*)?(#.*)?$/,
    (
      _match: string,
      _scheme: string | undefined,
      s: string | undefined,
      _slashes: string | undefined,
      d: string | undefined,
      p: string | undefined,
      q: string | undefined,
      f: string | undefined,
    ): string => {
      schema = s || "";
      domain = d || "";
      path = p || "";
      query = q ? parseQuery(q.substring(1)) : {};
      fragment = f || "";
      return "";
    },
  );
  return { schema, domain, path, query, fragment };
}

export function serializeQuery(query: Query, encode = encodeQueryComponent): string {
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) pairs.push([key, v]);
    } else if (value !== undefined) {
      pairs.push([key, value]);
    }
  }
  return pairs.map(([key, value]) => `${encode(key)}=${encode(value)}`).join("&");
}

export function serializeUri(options: string | Uri): string {
  if (typeof options === "string") return options;
  const { schema, domain, query, fragment } = options;
  let { path } = options;
  let uri = "";
  if (schema) uri += `${schema}:`;
  if (domain) uri += `//${domain}`;
  else if (schema && path && path[0] === "/") uri += "//";
  if (path) {
    if (domain && path[0] !== "/") path = `/${path}`;
    uri += path;
  }
  if (query) {
    const q = typeof query === "object" ? serializeQuery(query) : query;
    if (q) uri += `?${q}`;
  }
  if (fragment) {
    uri += fragment[0] !== "#" ? `#${fragment}` : fragment;
  }
  return uri;
}

export function newUri(...list: Uri[]): Uri {
  const result: Uri = { schema: "", domain: "", path: "", query: {}, fragment: "" };
  for (const uri of list) {
    if (uri.schema) result.schema = uri.schema;
    if (uri.domain) result.domain = uri.domain;
    if (uri.path) result.path = uri.path;
    const q = { ...uri.query };
    if (Object.keys(q).length) result.query = q;
    if (uri.fragment) result.fragment = uri.fragment;
  }
  return result;
}

export function resolveUris(from: Uri, ...uris: Uri[]): Uri {
  let result = from;
  for (const uri of uris) result = resolveUri(result, uri);
  return result;
}

export function resolveUri(from: Uri, to: Uri): Uri {
  const target: Uri =
    !to.schema && !to.domain
      ? { ...from, path: to.path, query: to.query, fragment: to.fragment }
      : to;
  const result = newUri(target);
  const resolve =
    (!from.schema && !from.domain) ||
    (!target.schema && !target.domain) ||
    (from.schema === target.schema && from.domain === target.domain);
  if (resolve) {
    const toPath = _splitPath(target.path);
    let path: string[];
    if (toPath.length && !toPath[0]) {
      // Target path is absolute.
      path = _resolve(toPath);
    } else {
      const fromPath = _splitSourcePath(from.path);
      path = _resolve([...fromPath, ...toPath]);
    }
    result.path = path.join("/");
  }
  if (target.query) result.query = target.query;
  if (target.fragment) result.fragment = target.fragment;
  return result;
}

export function makeRelativeUri(from: Uri, to: Uri): Uri {
  let result = newUri(to);
  if (!to.schema && !to.domain) {
    result = resolveUri(from, to);
  }
  if (from.schema === to.schema && from.domain === to.domain) {
    const fromPath = _splitSourcePath(from.path);
    const toPath = _splitPath(to.path);
    const minLen = Math.min(fromPath.length, toPath.length - 1);
    let commonLen = 0;
    for (; commonLen < minLen; commonLen++) {
      if (fromPath[commonLen] !== toPath[commonLen]) break;
    }
    const path: string[] = [];
    for (let i = commonLen; i < fromPath.length; i++) path.push("..");
    if (!path.length) path.push(".");
    for (let i = commonLen; i < toPath.length; i++) path.push(toPath[i]);
    result = newUri({
      schema: "",
      domain: "",
      path: path.join("/"),
      query: to.query,
      fragment: to.fragment,
    });
  }
  return result;
}

export function joinUri(...uris: Uri[]): Uri {
  const result = newUri(uris[0]);
  const path: string[] = [];
  let query: Query = result.query;
  let fragment = result.fragment;
  let idx = 0;
  for (const uri of uris) {
    const segments = _splitPath(uri.path);
    if (idx > 0 && (segments[0] === "" || segments[0] === ".")) {
      segments.shift();
    }
    if (segments.length) {
      if (path.length > 1 && !path[path.length - 1]) path.pop();
      path.push(...segments);
    }
    query = uri.query;
    fragment = uri.fragment;
    idx++;
  }
  result.path = path.join("/");
  result.query = { ...query };
  result.fragment = fragment;
  return result;
}

function _splitPath(path: string): string[] {
  if (!path) return [];
  return path.split("/");
}

function _splitSourcePath(path: string): string[] {
  const segments = _splitPath(path);
  segments.pop();
  return segments;
}

function _resolve(segments: string[]): string[] {
  const path: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (i < segments.length - 1 && !segment) continue;
    if (i > 0 && segment === ".") continue;
    if (segment === "..") path.pop();
    else path.push(segment);
  }
  if (path[0] !== "/" && path[0] !== ".") path.unshift("");
  return path;
}
