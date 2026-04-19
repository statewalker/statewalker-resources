import type { FilesApi } from "./FilesApi.js";
import { WorkspaceProject } from "./WorkspaceProject.js";

export class Workspace {
  readonly filesApi: FilesApi;

  constructor({ filesApi }: { filesApi: FilesApi }) {
    this.filesApi = filesApi;
  }

  public getProjectPath(projectName: string, ...path: string[]): string {
    const segments = [projectName, ...path]
      .flatMap((segment) => segment.split(/\/\\/gim))
      .map((segment) => segment.trim())
      .filter((segment) => segment !== "." && segment.length > 0);
    return `/${segments.join("/")}`;
  }

  #projectsIndex: Record<string, WorkspaceProject> = {};

  async #newProjectInstance(
    projectName: string,
    create = false,
  ): Promise<WorkspaceProject | undefined> {
    const projectPath = this.getProjectPath(projectName);
    const stat = await this.filesApi.stats(projectPath);
    if (!stat && !create) {
      return undefined;
    }
    if (stat && stat.kind !== "directory") {
      throw new Error(`Project path is not a directory: ${projectPath}`);
    }
    const project = new WorkspaceProject(this, projectName);
    if (!stat) {
      await project.writeConfig();
    }
    return project;
  }

  async #getProject(
    projectName: string,
    create: boolean,
  ): Promise<WorkspaceProject | undefined> {
    let project: WorkspaceProject | undefined =
      this.#projectsIndex[projectName];
    if (!project) {
      project = await this.#newProjectInstance(projectName, create);
      if (project) {
        this.#projectsIndex[projectName] = project;
      }
    }
    return project;
  }

  async getProject(projectName: string): Promise<WorkspaceProject | undefined> {
    return await this.#getProject(projectName, false);
  }

  async getOrCreateProject(projectName: string): Promise<WorkspaceProject> {
    return (await this.#getProject(projectName, true)) as WorkspaceProject;
  }

  protected async *readProjectsNames(): AsyncGenerator<string> {
    for await (const entry of this.filesApi.list("/")) {
      if (entry.kind === "directory") {
        yield entry.name;
      }
    }
  }

  async getProjectsNames(): Promise<string[]> {
    const projectNames: string[] = [];
    for await (const projectName of this.readProjectsNames()) {
      projectNames.push(projectName);
    }
    return projectNames;
  }

  async *readProjects(): AsyncGenerator<WorkspaceProject> {
    for await (const projectName of this.readProjectsNames()) {
      yield await this.getOrCreateProject(projectName);
    }
  }

  async getProjects(): Promise<WorkspaceProject[]> {
    const projects: WorkspaceProject[] = [];
    for await (const project of this.readProjects()) {
      projects.push(project);
    }
    return projects;
  }
}
