import { normalizePath } from "@statewalker/webrun-files";
import { RepositoryAdapter } from "../core/index.js";
import { Project } from "./project.js";

/** Default name of a project's system folder (holds persisted build state). */
export const DEFAULT_SYSTEM_FOLDER = ".project";

export class Workspace extends RepositoryAdapter {
  /**
   * Name of the per-project system folder where build state is persisted.
   * Configured via the repository option `systemFolder`; defaults to `.project`.
   */
  get systemFolder(): string {
    return (this.repository.options.systemFolder as string | undefined) ?? DEFAULT_SYSTEM_FOLDER;
  }

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
