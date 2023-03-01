import ResourceAdapter from "../core/ResourceAdapter.js";
import Workspace from "./Workspace.js";
import { resolveUrl,concatPath } from "@statewalker/uris";

export default class Project extends ResourceAdapter {
/*
  async getManifest() {
    const jsonAdapter = this.requireAdapter(JsonAdapter);
    return await jsonAdapter.getJson();
  }
*/

  get projectName() {
    const pathSegments = this.path.split("/").filter((s) => !!s);
    return pathSegments[0];
  }

  get workspace() {
    return this.repository.getAdapter(Workspace);
  }

  resolveProjectPath(path){
    return concatPath(resolveUrl(this.path, "."), path)
  }

  async getProjectResource(path, create = false) {
    const resourcePath=this.resolveProjectPath(path)
    return this.repository.getResource(resourcePath, create)
  }
}
