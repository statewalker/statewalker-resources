import { RepositoryAdapter } from "../core/RepositoryAdapter.ts";
import { Project } from "./Project.ts";

export class Workspace extends RepositoryAdapter {
  async getProjects() {
    const result = [];
    for await (const project of this.listProjects()) {
      result.push(project);
    }
    return result;
  }

  async *listProjects() {
    for await (const resource of this.repository.getResources("/", false)) {
      const project = await this.getProject(resource.path, false);
      if (project) yield project;
    }
  }

  getProjectDirectory(name: string) {
    return this.repository.filesApi.normalizePath(name);
  }

  async getProject(path: string) {
    return (await this._loadProject(path, true)) as Project;
  }

  async loadProject(path: string) {
    return await this._loadProject(path, false);
  }

  async _loadProject(path: string, create = false) {
    const projectDirName = this.getProjectDirectory(path);
    const projectDir = await this.repository.getResource(
      projectDirName,
      create
    );
    if (!projectDir) return null;
    return projectDir.requireAdapter(Project);
  }
}
