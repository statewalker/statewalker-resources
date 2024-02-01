declare module "@statewalker/uris" {

  export function newPathMapping(
    mapping: Record<string, string> | [string, string][]
  ): (p: string) => string | null;

  export function concatPath(...uris: string[]): string;

  export function resolveUrl(...urls: string[]): string;

  export function makeRelative(...uris: string[]): string;

  // ---------------------------------------------------------------------------

  export type TUriQuery = Record<string, any>;
  export type TUri = {
    schema?: string;
    domain?: string;
    path?: string;
    query?: TUriQuery;
    fragment?: string;
  };

  export function parseQuery(
    query: string,
    decode = decodeQueryComponent
  ): TUriQuery;

  export function parseUri(uri: string): TUri;

  export function serializeQuery(
    query: TUriQuery,
    encode = encodeQueryComponent
  ): string;

  export function serializeUri(uri: TUri): string;

  export function newUri(...list: TUri[]): TUri;

  export function resolveUris(from: TUri, ...uris: TUri[]): TUri;

  export function resolveUri(from: TUri, to: TUri): TUri;

  export function makeRelativeUri(from: TUri, to: TUri): TUri;

  export function joinUri(...uris: TUri[]): TUri;

  export function decodeQueryComponent(str: string): string;

  export function encodeQueryComponent(str: string): string;
}
