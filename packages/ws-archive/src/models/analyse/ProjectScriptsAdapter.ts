import { getAdapter } from "../../lib/newAdapter.js";
import type { FilesApi } from "../workspace/FilesApi.js";
import {
  FilesApiIOAdapter,
  type FilesApiWithPath,
  normalizePath,
} from "../workspace/FilesApiIOAdapter.js";

export type SqlScriptReference = {
  name: string;
  filePath: string;
  fileName: string;
};
export class SqlScriptsAdapter {
  static get: (adaptable: FilesApiWithPath) => SqlScriptsAdapter;
  static remove: (adaptable: FilesApiWithPath) => void;
  static {
    [SqlScriptsAdapter.get, SqlScriptsAdapter.remove] = getAdapter<
      SqlScriptsAdapter,
      FilesApiWithPath
    >("adapter.filesApi.scripts", ({ filesApi, basePath = "" }) => {
      return new SqlScriptsAdapter(filesApi, `${basePath}/sql-queries`);
    });
  }

  filesApi: FilesApi;
  basePath: string;

  constructor(filesApi: FilesApi, basePath = "./sql-queries") {
    this.filesApi = filesApi;
    this.basePath = normalizePath(basePath);
  }

  get io() {
    return FilesApiIOAdapter.get(this);
  }

  toRelativePath(path: string): string {
    return normalizePath(path).replace(this.basePath, "");
  }

  toAbsolutePath(path: string): string {
    return normalizePath(this.basePath, path);
  }

  async readSqlScript(path: string): Promise<string> {
    const sqlFilePath = this.toRelativePath(path);
    return await this.io.readText(sqlFilePath);
  }

  async writeSqlScript(
    path: string,
    script: string,
  ): Promise<SqlScriptReference> {
    let sqlFilePath = this.toRelativePath(path);
    sqlFilePath = sqlFilePath.replace(/\.sql$/gim, "");
    sqlFilePath += ".sql";
    await this.io.writeText(sqlFilePath, script);
    return this.#toSqlScriptReference(sqlFilePath);
  }

  async newSqlScriptFileReference(path?: string): Promise<SqlScriptReference> {
    let fixedPath = path?.trim();
    if (!fixedPath) {
      fixedPath = new Date().toISOString().split(".")[0].replace('T', '.').replaceAll(':', '_');
    }
    if (!fixedPath.match(/\.sql/i)) {
      fixedPath = `${fixedPath}.sql`;
    }
    fixedPath = this.toAbsolutePath(fixedPath);
    return this.#toSqlScriptReference(fixedPath);
  }

  async getScriptsReferences(): Promise<SqlScriptReference[]> {
    const references: SqlScriptReference[] = [];
    for await (const ref of this.readScriptsReferences()) {
      references.push(ref);
    }
    return references;
  }

  async *readScriptsReferences(): AsyncGenerator<SqlScriptReference> {
    const files = await this.filesApi.list(this.basePath, { recursive: true });
    for await (const file of files) {
      if (file.kind !== "file") {
        continue;
      }
      if (!file.name.match(/\.sql$/gim)) {
        continue;
      }
      yield this.#toSqlScriptReference(file.path);
    }
  }

  #toSqlScriptReference(path: string): SqlScriptReference {
    const filePath = (path);
    const fileName = filePath.split("/").pop() ?? "";
    const name = fileName.replace(/\.sql$/, "");
    return {
      name,
      filePath,
      fileName,
    };
  }
}
