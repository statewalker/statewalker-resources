import type { Db, DbEntry } from "../../lib-sql/db.js";
import { newDebounced } from "../../lib/agen/debounce.js";
import { getAdapter, newAdapter } from "../../lib/newAdapter.js";
import type { Workspace } from "./Workspace.js";
import type { WorkspaceProject } from "./WorkspaceProject.js";

/**
 * A factory transforming data blobs to databases and serializing databases to blobs.
 * A specific implementation of this factory should be provided to the workspace
 * using the {@link setDbFactory} method.
 */
export type DbFactory = {
  newDb: (data: Blob) => Promise<Db>;
  exportDb: (db: Db) => Promise<Blob>;
};

/**
 * The [getDbFactory, setDbFactory] methods allows to define and use databases factories with workspaces.
 * It is used by the WorkspaceProjectDbAdapter to create and export databases.
 *
 * The returned `getDbFactory` method could be used only after the initializing the factory
 * in the workspace with the `setDbFactory`.
 *
 * Example of usage:
 * ```typescript
 * const workspace = new Workspace({ filesApi });
 *
 * // Initialize the factory
 * setDbFactory(new DbFactory());
 *
 * // Get the factory
 * const #dbFactory = getDbFactory(workspace);
 * const db = await #dbFactory.newDb(new Blob());
 * // ...
 *
 * ```
 * @param workspace The workspace to create the DbFactory for.
 * @returns The DbFactory instance.
 */
export const [getDbFactory, setDbFactory] = newAdapter<DbFactory, Workspace>(
  "context.dbFactory",
);

/**
 * Returns the database adapter for the given workspace project.
 * @param project The workspace project to get the database adapter for.
 * @returns The database adapter for the project.
 */
const [getWorkspaceProjectDbAdapter, removeWorkspaceProjectDbAdapter] =
  getAdapter<WorkspaceProjectDbAdapter, WorkspaceProject>(
    "adapter.workspace.project.db",
    (project: WorkspaceProject) => {
      const dbFactory = getDbFactory(project.workspace);
      return new WorkspaceProjectDbAdapter({ project, dbFactory });
    },
  );

/**
 * Adapter for the database operations in the workspace project.
 * Instances of this type could be created using the {@link getWorkspaceProjectDbAdapter} function.
 */
export class WorkspaceProjectDbAdapter {
  static get = getWorkspaceProjectDbAdapter;
  static remove = removeWorkspaceProjectDbAdapter;

  project: WorkspaceProject;
  get workspace(): Workspace {
    return this.project.workspace;
  }

  #dbFactory: DbFactory;
  #db: Db | undefined;

  syncDelay = 1000;

  get databasePath(): string {
    return this.project.getProjectPath("_project.db");
  }

  async projectDbExists(): Promise<boolean> {
    return !!(await this.project.filesApi.stats(this.databasePath));
  }

  constructor({
    project,
    dbFactory,
  }: {
    project: WorkspaceProject;
    dbFactory: DbFactory;
  }) {
    this.project = project;
    this.#dbFactory = dbFactory;
  }

  async getDb(): Promise<Db> {
    if (!this.#db) {
      this.#db = await this.openAutosyncDb({
        path: this.databasePath,
        syncDelay: this.syncDelay,
      });
    }
    return this.#db;
  }

  async query<T = DbEntry>(sql: string, args?: unknown[]): Promise<T[]> {
    const db = await this.getDb();
    const result = await db.query<T>(sql, args);
    return result;
  }

  async openAutosyncDb({
    path,
    syncDelay,
  }: {
    path: string;
    syncDelay: number;
  }): Promise<Db> {
    const entry = await this.project.filesApi.stats(path);
    let data: Blob;
    if (!entry) {
      data = new Blob();
    } else {
      const blocks: Uint8ClampedArray[] = [];
      for await (const block of this.project.filesApi.read(path)) {
        blocks.push(block);
      }
      data = new Blob(blocks);
    }
    const db = await this.#dbFactory.newDb(data);
    const debouncedNotify = newDebounced(syncDelay, async () => {
      const that = this;
      await this.project.filesApi.write(path, async function* () {
        const data = await that.#dbFactory.exportDb(db);
        yield data;
        console.log(data);
      });
    });
    return {
      async query<T = DbEntry>(sql: string, args?: unknown[]): Promise<T[]> {
        if (
          sql.match(/(INSERT|DELETE|UPDATE|COMMIT|ROLLBACK|CREATE|DROP)\s/gi)
        ) {
          debouncedNotify({ sql, args });
        }
        try {
          return db.query(sql, args);
        } catch (e) {
          console.error(e, sql, args);
          return [];
        }
      },
    };
  }
}
