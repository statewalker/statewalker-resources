import RepositoryAdapter from "../core/RepositoryAdapter.js";
import Project from "./Project.js";

export default class Workspace extends RepositoryAdapter {
  /**
   * Name of the file used as a marker that a folder used as a project managed by this workspace.
   */
  get projectFileName() {
    return "index.md";
  }

  async getProjects() {
    const list = [];
    for await (
      let resource of this.repository.getResources("/", false)
    ) {
      let project = await this.getProject(resource.path, false);
      if (project) list.push(project);
    }
    return list;
  }

  getProjectFilePath(name) {
    return this.repository.filesApi.normalizePath(name) + "/" +
      this.projectFileName;
  }

  async getProject(path, create = false) {
    path = this.getProjectFilePath(path);
    const projectManifest = await this.repository.getResource(path, create);
    return projectManifest ? projectManifest.requireAdapter(Project) : null;
  }
}
