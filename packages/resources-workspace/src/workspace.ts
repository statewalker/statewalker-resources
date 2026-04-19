import { RepositoryAdapter } from "@statewalker/resources-core";
import { normalizePath } from "@statewalker/webrun-files";
import { Project } from "./project.js";

export class Workspace extends RepositoryAdapter {
  async getProjects(): Promise<Project[]> {
    const result: Project[] = [];
    for await (const project of this.listProjects()) {
      result.push(project);
    }
    return result;
  }

  async *listProjects(): AsyncGenerator<Project> {
    for await (const resource of this.repository.getResources("/", false)) {
      const project = await this.getProject(resource.path, false);
      if (project) yield project;
    }
  }

  getProjectDirectory(name: string): string {
    return normalizePath(name);
  }

  async getProject(path: string, create = false): Promise<Project | null> {
    const projectDirName = this.getProjectDirectory(path);
    const projectDir = await this.repository.getResource(projectDirName, create);
    if (!projectDir) return null;
    return projectDir.requireAdapter<Project>(Project);
  }
}
