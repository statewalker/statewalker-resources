import type { Project, Workspace } from "@statewalker/resources-workspace";
import { assertWikiKey } from "./wiki-uri.js";

/**
 * Open (or create) the wiki `Project` whose key is `key`. A wiki key is bound to
 * `Project.projectName`, so the key MUST satisfy `WIKI_KEY_RE` — an invalid key is
 * rejected before any project is created. Returns `null` if the project does not
 * exist and `create` is false.
 */
export async function openWiki(
  workspace: Workspace,
  key: string,
  create = false,
): Promise<Project | null> {
  assertWikiKey(key);
  return workspace.getProject(key, create);
}
