import { ResourceAdapter } from "../core/ResourceAdapter.ts";
import { Workspace } from "./Workspace.ts";
import { concatPath } from "@statewalker/uris";
import { Notebook } from "./Notebook.ts";

export class Project extends ResourceAdapter {
  get projectName() {
    const pathSegments = this.path.split("/").filter((s) => !!s);
    return pathSegments[0];
  }

  get workspace() {
    return this.repository.getAdapter(Workspace);
  }

  async getNotebook(path: string) {
    return (await this._loadNotebook(path, true)) as Notebook;
  }

  async _loadNotebook(path: string, create: boolean) {
    const resource = await this.getProjectResource(path, create);
    return resource?.requireAdapter(Notebook);
  }

  async getRootNotebook() {
    return await this.getNotebook("./index.md");
  }

  resolveProjectPath(path: string) {
    return concatPath(this.path, path);
  }

  async getProjectResource(path: string, create = false) {
    const resourcePath = this.resolveProjectPath(path);
    return this.repository.getResource(resourcePath, create);
  }
}
