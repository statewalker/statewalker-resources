import { type Resource, ResourceAdapter } from "@statewalker/resources-core";
import { concatPath } from "@statewalker/uris";
import { Notebook } from "./notebook.js";
import { Workspace } from "./workspace.js";

export class Project extends ResourceAdapter {
  get projectName(): string {
    const pathSegments = this.path.split("/").filter((s) => !!s);
    return pathSegments[0];
  }

  get workspace(): Workspace | null {
    return this.repository.getAdapter<Workspace>(Workspace);
  }

  async getNotebook(path: string, create?: boolean): Promise<Notebook | null> {
    const resource = await this.getProjectResource(path, create);
    return resource ? resource.requireAdapter<Notebook>(Notebook) : null;
  }

  async getRootNotebook(): Promise<Notebook | null> {
    return await this.getNotebook("./index.md", true);
  }

  resolveProjectPath(path: string): string {
    return concatPath(this.path, path);
  }

  async getProjectResource(path: string, create = false): Promise<Resource | null> {
    const resourcePath = this.resolveProjectPath(path);
    return this.repository.getResource(resourcePath, create);
  }
}
