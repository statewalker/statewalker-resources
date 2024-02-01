declare module "@statewalker/webrun-files" {
  /**
   * File information.
   */
  export type FileInfo = {
    // File kind: "file" or "directory".
    kind: "file" | "directory";
    // Full path to the file or directory.
    path: string;
    // Name of the file or directory. It is the last part of the path.
    name?: string;
    // Mime type of the file content.
    type: string;
    // File size in bytes. For directories it is always 0.
    size: number;
    // Last modification time in milliseconds since the Unix epoch.
    lastModified: number;
  };

  export type FileRef = string | { path: string };

  export class FilesApi {
    constructor(options: Record<string, any>);

    /**
     * Returns an async generator providing information about files (FileInfo[]).
     * Paths corresponding to directories has the "/" trailing symbol.
     * @param {object|string} file path to the folder or an object returned by the `list` or `info` methods
     * @param {object} options optional parameters
     * @param {boolean} options.recursive this flag defines if the returned generator
     * should give access to all child directories and files or just direct children
     * @return {AsyncGenerator<FileInfo>} generator returning information about
     * individual file entries
     */
    async *list(
      file: FileRef,
      options: {
        recursive: boolean;
      } = {}
    ): AsyncGenerator<TFile>;

    /**
     * Returns information about an individual file.
     * @param {object|string} file path to the file or an object returned by
     * the `list` or `info` methods
     * @return {FileInfo} information about the file corresponding to the specified
     * path or null if there is no such a file
     */
    async stats(file: FileRef): Promise<FileInfo>;

    /**
     * Removes file or folder corresponding to the specified path.
     * All children of this entry will be removed as well.
     * @param {object|string} file path to the file to remove or an object
     * returned by the `list` or `info` methods
     * @return {boolean} return true if the file was removed
     */
    async remove(file: FileRef): Promise<boolean>;

    /**
     * Creates and returns a write stream for the file with the specified path.
     * @param {object|string} file path to the file or an object returned by
     * the `list` or `info` methods
     * @param {AsyncGenerator|AsyncGenerator} content async generator function providing the binary
     * file content to store
     * @return {any} result of the action execution
     */
    async write(
      file: FileRef,
      content:
        | AsyncGenerator<Uint8Array>
        | Generator<Uint8Array>
        | Iterable<Uint8Array>
        | AsyncIterable<Uint8Array>
    ): Promise<void>;

    /**
     * Creates an returns an AsyncGenerator returning byte blocks with the file content.
     * @param {object|string} file path to the file or an object returned by
     * the `list` or `info` methods
     * @param {object} options read parameters
     * @param {number} options.start starting read position; default value is 0
     * @param {number} options.bufferSize the optional size of returned chunks buffers
     */
    async *read(
      file: FileRef,
      options?: { start?: number; bufferSize?: number } = {}
    ): AsyncGenerator<Uint8Array>;

    /**
     * Copies a file from one path to another.
     * @param source path to the source file
     * @param target path to the target file
     * @param options additional options
     * @param options.recursive if this flag is true then subfolders are also copied
     * @return true if the file was successfully copied
     */
    async copy(
      source: FileRef,
      target: FileRef,
      options?: {
        recursive: boolean;
      } = {}
    );

    /**
     * Moves files from the initial position to the target path.
     * The default implementation creates a new file copy in the new location
     * and removes the old file.
     *
     * @param fromPath path to the source file
     * @param toPath path to the target file
     * @param options additional options
     * @return true if the file was successfully moved
     */
    async move(
      fromPath: FileRef,
      toPath: FileRef,
      options?: {
        recursive: boolean;
      } = {}
    ): Promise<boolean>;

    /**
     * Returns a normalized file path.
     * @param file the file path or a file object reference
     */
    normalizePath(file: FileRef): string;
  }

  // ---------------------------------------------------------------------------
  // Pure in-memory FS implementation. For test purposes.

  /**
   * File information.
   */
  export type MemFileContent =
    | Uint8Array
    | string
    | string[]
    | AsyncGenerator<string>
    | AsyncGenerator<Uint8Array>;
  export type MemFileInfo = {
    // Full path to the file or directory.
    path: string;
    // Mime type of the file content.
    type?: string;
    // File size in bytes. For directories it is always 0.
    size: number;
    // Content: a strings, iterator or async iterator.
    content: MemFileContent | (() => MemFileContent);
  };
  export type MemFilesApiOptions = {
    files?: Record<string, MemFileInfo>;
  } & Record<string, any>;
  export class MemFilesApi extends FilesApi {
    constructor(options: MemFilesApiOptions = {});
  }

  // ---------------------------------------------------------------------------
  // NodeJS specific implementation
  export type NodeFS = any;
  export type NodeFilesApiOptions = {
    fs: NodeFS;
    rootDir: string;
  } & Record<string, any>;
  export class NodeFilesApi extends FilesApi {
    constructor(options: NodeFilesApiOptions);
    get rootDir(): string;
    get fs(): NodeFS;
  }

  // ---------------------------------------------------------------------------
  // Browser specific implementation
  // It uses internally the browser file system API.
  export type BrowserFilesApiOptions = {
    // It should be a File System Api Handle
    // pointing to the root directory of this file system.
    rootHandle: any;
  } & Record<string, any>;

  export class BrowserFilesApi extends FilesApi {
    constructor(options: BrowserFilesApiOptions);
  }

  export async function openBrowserFilesApi({
    handlerKey = "root-dir",
    readwrite = true,
    // Methods below could be replaced by persistent implementation
    // using the "idb-keyval" package (methods "get", "set", "del").
    index = {},
    get = async (key) => index[key],
    set = async (key, handler) => (index[key] = handler),
    del = async (key) => delete index[key],
  } = {}): Promise<BrowserFilesApi>;

  // ---------------------------------------------------------------------------
  // Utility methods

  /**
   * Returns a normalized file path.
   * @param path the file path to normalize
   */
  export function normalizePath(path: string): string;

  export function addFilesApiLogger(filesApi: FilesApi): FilesApi;

  export function getMimeType(url: string): string;
}
