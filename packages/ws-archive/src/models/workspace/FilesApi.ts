export { openBrowserFilesApi } from "@statewalker/webrun-files";

export type FileInfo = {

  // Kind of the returned entity
  kind : 'file' | 'directory';

  // The local name of this file entry (the last segment of the path)
  name: string;

  // Path to the file from the root of the "file system".
  path: string;

  // An optional mime type of the file content; it is not defined for directories.
  type?: string;

  // Size of the file (only for files)
  size?: number;

  // Modification time as a long integer
  lastModified: number;

}

export type FileRef = string | {
  path : string;
}

/**
 * This is a common interface providing access to methods dealing with files.
 */
export default interface FilesApi {

  /**
   * Returns an async generator providing information about files (FileInfo[]).
   * Paths corresponding to directories has the "/" trailing symbol.
   * @param {Object|String} file path to the folder or an object returned by the `list` or `info` methods
   * @param {Object} options optional parameters
   * @param {Boolean} options.recursive this flag defines if the returned generator
   * should give access to all child directories and files or just direct children
   * @return {AsyncGenerator<FileInfo>} generator returning information about
   * individual file entries
   */
  list(file: FileRef, options? : { recursive?: boolean }) : AsyncGenerator<FileInfo>;

  /**
   * Returns information about an individual file.
   * @param {Object|String} file path to the file or an object returned by
   * the `list` or `info` methods
   * @return {FileInfo} information about the file corresponding to the specified
   * path or null if there is no such a file
   */
  stats(file: FileRef) : Promise<FileInfo | undefined>;

  /**
   * Removes file or folder corresponding to the specified path.
   * All children of this entry will be removed as well.
   * @param {Object|String} file path to the file to remove or an object
   * returned by the `list` or `info` methods
   * @return {Boolean} return true if the file was removed
   */
  remove(file : FileRef) : Promise<boolean>;

  /**
   * Creates and returns a write stream for the file with the specified path.
   * @param {Object|String} file path to the file or an object returned by
   * the `list` or `info` methods
   * @param {AsyncGenerator|AsyncIterator} content async generator function providing the binary
   * file content to store
   * @return {any} result of the action execution
   */
  write(file: FileRef, content : AsyncIterable<Uint8Array>): Promise<void>;

  /**
   * Creates an returns an AsyncIterator returning byte blocks with the file content.
   * @param {Object|String} file path to the file or an object returned by
   * the `list` or `info` methods
   * @param {object} options read parameters
   * @param {number} options.start starting read position; default value is 0
   * @param {number} options.bufferSize the optional size of returned chunks buffers
   */
  read(file: FileRef, options? : { start? : number, bufferSize?: number}) : AsyncGenerator<Uint8Array>;

  /**
   * Copies a file from one path to another.
   * @param {String} source path to the source file
   * @param {String} target path to the target file
   * @param {Object} options additional options
   * @param {boolean} options.recursive if this flag is true then subfolders are also copied
   * @return {Boolean} if the file was successfully copied
   */
  copy(source : FileRef, target : FileRef, options? : { recursive?: boolean }) : Promise<boolean>;

  /**
   * Moves files from the initial position to the target path.
   * The default implementation creates a new file copy in the new location
   * and removes the old file.
   *
   * @param {String} source path to the source file
   * @param {String} target path to the target file
   * @param {Object} options additional options
   * @return {Boolean} if the file was successfully moved
   */
  move(source : FileRef, target : FileRef) : Promise<boolean>;

  /**
   * Utility methods normalizing paths
   */
  normalizePath(file: FileRef) : string; 
}