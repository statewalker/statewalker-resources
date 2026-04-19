import type { FilesApi } from "./FilesApi.js";
import { FilesApiIOAdapter } from "./FilesApiIOAdapter.js";
import type { Workspace } from "./Workspace.js";

export class WorkspaceProject {
  constructor(
    public workspace: Workspace,
    public projectName: string,
  ) {}

  get io(): FilesApiIOAdapter {
    return FilesApiIOAdapter.get(this);
  }

  get basePath(): string {
    return this.workspace.getProjectPath(this.projectName);
  }

  get filesApi(): FilesApi {
    return this.workspace.filesApi;
  }

  getProjectPath(...path: string[]): string {
    return this.workspace.getProjectPath(this.projectName, ...path);
  }

  get configPath(): string {
    return ".project.json";
  }

  async readConfig() {
    return this.io.readJson(this.configPath);
  }

  async writeConfig() {
    return await this.io.writeJson(this.configPath, { name: this.projectName });
  }
}
