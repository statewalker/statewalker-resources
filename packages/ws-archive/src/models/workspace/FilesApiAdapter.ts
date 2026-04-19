import { getAdapter } from "../../lib/newAdapter.js";
import { newListeners } from "../../lib/newListeners.js";
import type { FilesApi } from "./FilesApi.js";
export class FilesApiAdapter {
  /**
   * Returns the files API adapter for the given context object.
   * @param project The workspace project to get the database adapter for.
   * @returns The database adapter for the project.
   */
  static get: <C = unknown>(context: C) => FilesApiAdapter;
  static remove: <C = unknown>(context: C) => void;
  static {
    [FilesApiAdapter.get, FilesApiAdapter.remove] = getAdapter<FilesApiAdapter>(
      "adapter.filesApi",
      () => new FilesApiAdapter(),
    );
  }

  // -------------------------------------------------------

  #filesApi: FilesApi | null = null;
  addListener: (listener: (api: FilesApi) => void) => () => void;
  protected notifyListeners: (api: FilesApi) => Promise<void>;
  get filesApi() {
    return this.#filesApi;
  }
  set filesApi(filesApi: FilesApi) {
    this.#filesApi = filesApi;
    this.notifyListeners(filesApi);
  }
  constructor() {
    [this.addListener, this.notifyListeners] =
      newListeners<[FilesApiAdapter]>();
  }
}
