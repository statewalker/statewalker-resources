import ResourceAdapter from "../core/ResourceAdapter.js";
import Workspace from "./Workspace.js";
import JsonAdapter from "../core/JsonAdapter.js";

export default class Project extends ResourceAdapter {

  async getManifest() {
    const jsonAdapter = this.requireAdapter(JsonAdapter);
    return await jsonAdapter.getJson();
  }

  get projectName() {
    const pathSegments = this.path.split("/").filter((s) => !!s);
    return pathSegments[0];
  }

  get workspace() {
    return this.repository.getAdapter(Workspace);
  }
}
