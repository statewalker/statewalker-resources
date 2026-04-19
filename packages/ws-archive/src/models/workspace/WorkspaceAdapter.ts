import { getAdapter } from "../../lib/newAdapter.js";
import { newListeners } from "../../lib/newListeners.js";
import type { FilesApi } from "./FilesApi.js";
import { FilesApiAdapter } from "./FilesApiAdapter.js";
import { Workspace } from "./Workspace.js";
import type { WorkspaceProject } from "./WorkspaceProject.js";

export class WorkspaceAdapter {
  static get: <C extends object>(context: C) => WorkspaceAdapter;
  static remove: <C extends object>(context: C) => void;
  static {
    [WorkspaceAdapter.get, WorkspaceAdapter.remove] =
      getAdapter<WorkspaceAdapter>("adapter.workspace", (context) => {
        const { filesApi } = FilesApiAdapter.get(context);
        return new WorkspaceAdapter({ filesApi });
      });
  }

  workspace: Workspace;
  onCurrentProjectChange: (
    listener: (project: WorkspaceProject | undefined) => void,
  ) => () => void;
  notifyListeners: (project: WorkspaceProject | undefined) => void;

  constructor({ filesApi }: { filesApi: FilesApi }) {
    this.workspace = new Workspace({ filesApi });
    [this.onCurrentProjectChange, this.notifyListeners] =
      newListeners<[WorkspaceProject | undefined]>();
  }

  #currentProject: WorkspaceProject | undefined;
  get currentProject() {
    return this.#currentProject;
  }
  set currentProject(project: WorkspaceProject | undefined) {
    this.#currentProject = project;
    this.notifyListeners(project);
  }

  async getProjectsList() {
    return await this.workspace.getProjects();
  }
}
