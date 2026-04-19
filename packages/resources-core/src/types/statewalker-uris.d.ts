declare module "@statewalker/uris" {
  export interface ParsedUri {
    path: string;
    [key: string]: unknown;
  }
  export function parseUri(uri: string): ParsedUri;
  export function concatPath(...paths: string[]): string;
}
