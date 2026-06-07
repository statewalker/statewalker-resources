import {
  concatPath,
  type Resource,
  type ResourceRepository,
} from "@statewalker/resources-workspace";

const DEFAULT_SYSTEM_FOLDER = ".project";

/**
 * Resolve where a source resource's derived per-page artifacts live: under the
 * project's system folder at `<project>/<systemFolder>/pages/<uri>/`. The project
 * is the resource path's first segment; `uri` is the remainder (project-relative).
 */
export function pageArtifactPath(resource: Resource, artifact: string): string {
  const repository = resource.repository as ResourceRepository;
  const systemFolder =
    (repository.options.systemFolder as string | undefined) ?? DEFAULT_SYSTEM_FOLDER;
  const p = resource.path.replace(/^\/+/, "");
  const slash = p.indexOf("/");
  const projectPath = slash === -1 ? p : p.slice(0, slash);
  const uri = slash === -1 ? "" : p.slice(slash + 1);
  return concatPath(projectPath, systemFolder, "pages", uri, artifact);
}

/** The project-relative URI of a source resource (path minus the project segment). */
export function resourceUri(resource: Resource): string {
  const p = resource.path.replace(/^\/+/, "");
  const slash = p.indexOf("/");
  return slash === -1 ? "" : p.slice(slash + 1);
}
