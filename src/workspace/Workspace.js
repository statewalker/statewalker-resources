import RepositoryAdapter from "../core/RepositoryAdapter.js";
import Project from "./Project.js";

export default class Workspace extends RepositoryAdapter {

  async getProjects() {
    const list = [];
    for await (
      let resource of this.repository.getResources("/", false)
    ) {
      let project = await this.getProject(resource.path, false);
      if (project) list.push(project);
    }
    return list
  }

  getProjectDirectory(name) {
    return this.repository.filesApi.normalizePath(name);
  }

  async getProject(path, create=false) {
    const projectDirName = this.getProjectDirectory(path)
    const projectDir = await this.repository.getResource(projectDirName, create);
    if (!projectDir) return null;
    return projectDir.requireAdapter(Project);
  }

}
