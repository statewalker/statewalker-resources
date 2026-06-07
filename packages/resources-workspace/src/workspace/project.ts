import { type Resource, ResourceAdapter } from "../core/index.js";
import { concatPath } from "../utils/index.js";
import { Workspace } from "./workspace.js";

/**
 * A project: an adapter on a top-level directory resource. Pure navigation —
 * incremental build (detect / reindex / builders) lives in the `ProjectBuilder`
 * adapter, reachable via `getAdapter(ProjectBuilder)`.
 */
export class Project extends ResourceAdapter {
  get projectName(): string {
    const pathSegments = this.path.split("/").filter((s) => !!s);
    return pathSegments[0];
  }

  get workspace(): Workspace | null {
    return this.repository.getAdapter<Workspace>(Workspace);
  }

  resolveProjectPath(path: string): string {
    return concatPath(this.path, path);
  }

  async getProjectResource(path: string, create = false): Promise<Resource | null> {
    const resourcePath = this.resolveProjectPath(path);
    return this.repository.getResource(resourcePath, create);
  }
}
