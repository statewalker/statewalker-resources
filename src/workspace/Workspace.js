import RepositoryAdapter from "../core/RepositoryAdapter.js";
import Project from "./Project.js";

export default class Workspace extends RepositoryAdapter {
  /**
   * Name of the file used as a marker that a folder used as a project managed by this workspace.
   */
  get projectFileName() {
    return ".project.json";
  }

  async *getProjects() {
    for await (
      let resource of this.repository.getResources("/", false)
    ) {
      let project = await this._getProject(resource.path, false);
      if (project) yield project;
    }
  }

  async getProject(name) {
    return this._getProject(name, false);
  }

  getProjectFilePath(name) {
    return this.repository.filesApi.normalizePath(name) + '/' + this.projectFileName;
  }

  async _getProject(path, create) {
    path = this.getProjectFilePath(path);
    const projectManifest = await this.repository.getResource(path, create);
    return projectManifest ? projectManifest.requireAdapter(Project) : null;
  }

}
