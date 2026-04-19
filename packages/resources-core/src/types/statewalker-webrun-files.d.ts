declare module "@statewalker/webrun-files" {
  export function normalizePath(path: string): string;
  export function joinPath(...segments: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;

  export type FileKind = "file" | "directory";

  export interface ReadOptions {
    start?: number;
    length?: number;
    signal?: AbortSignal;
  }

  export interface ListOptions {
    recursive?: boolean;
  }

  export interface FileStats {
    kind: FileKind;
    size?: number;
    lastModified?: number;
  }

  export interface FileInfo {
    name: string;
    path: string;
    kind: FileKind;
    size?: number;
    lastModified?: number;
  }

  export interface FilesApi {
    read(path: string, options?: ReadOptions): AsyncIterable<Uint8Array>;
    write(
      path: string,
      content: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
    ): Promise<void>;
    mkdir(path: string): Promise<void>;
    list(path: string, options?: ListOptions): AsyncIterable<FileInfo>;
    stats(path: string): Promise<FileStats | undefined>;
    exists(path: string): Promise<boolean>;
    remove(path: string): Promise<boolean>;
    move(source: string, target: string): Promise<boolean>;
    copy(source: string, target: string): Promise<boolean>;
  }
}

declare module "@statewalker/webrun-files-mem" {
  import type { FilesApi } from "@statewalker/webrun-files";

  export interface MemFilesApiOptions {
    initialFiles?: Record<string, string | Uint8Array>;
  }

  export class MemFilesApi implements FilesApi {
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
