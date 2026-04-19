import { getAdapter } from "../../lib/newAdapter.js";
import type { WorkspaceProject } from "../workspace/WorkspaceProject.js";
import { WorkspaceProjectDataAdapter } from "../workspace/WorkspaceProjectDataAdapter.js";

import { listen } from "../../lib/async/listen.js";
import { ChannelsGroups } from "./ChannelsGroups.js";
import { ChannelsGroupsGraph } from "./ChannelsGroupsGraph.js";
import { FilteringApp } from "./FilteringApp.js";

export const [getProjectFilteringApp, removeProjectFilteringApp] = getAdapter<
  Promise<FilteringApp>,
  WorkspaceProject
>(
  "adapter.filtering.app",
  async (project: WorkspaceProject): Promise<FilteringApp> => {
    const dataAdapter = WorkspaceProjectDataAdapter.get(project);
    const config = await dataAdapter.getConfig();
    const tables = await dataAdapter.getDataTables(true);
    const app = new FilteringApp({ config, tables, context: project });
    let initialized = false;

    /**
     * This method creates a backup of the current data tables
     * and writes the current data tables to disk.
     * It is called when the data tables are modified.
     * If the app is already initialized, it will overwrite the existing data tables.
     * If the app is not initialized, it will create a backup of the current data tables
     * and write the current data tables to disk.
     * If the backup is valid, it will remove the backup after writing the data tables.
     */
    async function writeTablesToDisk() {
      let savedVersion: string | undefined;
      if (initialized || !await dataAdapter.hasValidBackup()) {
        savedVersion = await dataAdapter.makeDataTablesBackup();
      }

      if (initialized) {
        // Write the new version of tables on the disk
        await dataAdapter.storeDataTables([
          app.dataSets[0].table,
          app.dataSets[1].table,
        ]);
        // If there is no difference between the newly saved version 
        // and already created backup then, we remove the backup.
        if (await dataAdapter.hasValidBackup() && savedVersion) {
          await dataAdapter.removeDataTablesBackup(savedVersion);
        }
      }
      initialized = true;
    }

    app._register(
      listen(app.dataSets[0].observeTable(), async () => {
        await writeTablesToDisk();
      }),
    );
    app._register(
      listen(app.dataSets[1].observeTable(), async () => {
        await writeTablesToDisk();
      }),
    );

    return app;
  },
);

export const [getChannelsGroups, removeChannelsGroups] = getAdapter<
  ChannelsGroups,
  FilteringApp
>("adapter.app.groups", (app) => {
  return new ChannelsGroups(app.channels);
});

export const [getChannelsGroupsGraph, removeChannelsGroupsGraph] = getAdapter<
  Promise<ChannelsGroupsGraph>,
  FilteringApp
>("adapter.app.groups.graph", async (app) => {
  const groups = getChannelsGroups(app);
  return ChannelsGroupsGraph.build(groups);
});
