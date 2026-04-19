declare module "@statewalker/webrun-files" {
  export function normalizePath(path: string): string;
  export function joinPath(...segments: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
}

declare module "@statewalker/webrun-files-mem" {
  export interface MemFilesApiOptions {
    initialFiles?: Record<string, string | Uint8Array>;
  }

  export class MemFilesApi {
    constructor(options?: MemFilesApiOptions);
    read(path: string, options?: any): AsyncIterable<Uint8Array>;
    write(
      path: string,
      content: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
    ): Promise<void>;
    mkdir(path: string): Promise<void>;
    list(path: string, options?: any): AsyncIterable<any>;
    stats(path: string): Promise<any>;
    exists(path: string): Promise<boolean>;
    remove(path: string): Promise<boolean>;
    move(source: string, target: string): Promise<boolean>;
    copy(source: string, target: string): Promise<boolean>;
  }
}
