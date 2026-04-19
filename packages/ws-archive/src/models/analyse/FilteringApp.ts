import type * as aq from "arquero";
import { Base } from "../../lib/Base.js";
import { newDebounced } from "../../lib/agen/debounce.js";
import { newAdapter } from "../../lib/newAdapter.js";
import {
  type DataSetConfig,
  DataSetsChannel,
  getChannelsConfig,
} from "./DataSetsChannel.js";
import { SourceDataSet } from "./SourceDataSet.js";

const [getFilteringApp, setFilteringApp] = newAdapter<
  Promise<FilteringApp> | undefined
>("adapter.filtering.app");

export type FilteringAppConfig = {
  dataSets: [DataSetConfig, DataSetConfig];
};

export class FilteringApp extends Base {
  static async get(context: unknown): Promise<undefined | FilteringApp> {
    return getFilteringApp(context) || Promise.resolve(undefined);
  }
  static async initInContext(
    context: unknown,
    load: () => Promise<{
      config: FilteringAppConfig;
      tables: [aq.ColumnTable, aq.ColumnTable];
    }>,
  ): Promise<FilteringApp> {
    const promise = (async () => {
      const { config, tables } = await load();
      return new FilteringApp({ context, config, tables });
    })();
    setFilteringApp(context, promise);
    return promise;
  }

  // -----------------------------------------------------------------------
  dataSets: [SourceDataSet, SourceDataSet];
  channels: DataSetsChannel[];
  config: FilteringAppConfig;

  get dataSetNames(): [string, string] {
    return this.dataSets.map((dataSet) => dataSet.dataSetName) as [
      string,
      string,
    ];
  }

  private context?: unknown;

  constructor({
    context,
    config,
    tables,
  }: {
    context: unknown;
    config: FilteringAppConfig;
    tables: [aq.ColumnTable, aq.ColumnTable];
  }) {
    super();
    this.context = context;
    if (this.context) {
      this._register(async () => {
        // Remove itself from the context
        const app = await getFilteringApp(context);
        if (app === this) {
          setFilteringApp(context, undefined);
        }
        this.context = undefined;
      });
    }

    this.config = config;

    this.dataSets = [
      new SourceDataSet(tables[0], config.dataSets[0]),
      new SourceDataSet(tables[1], config.dataSets[1]),
    ];
    this.reloadChannelsStats();
    this._initializeChannelsMasksPropagation();
  }

  reloadChannelsStats() {
    const channelsFieldsIndex: Record<string, [string[], string[]]> =
      getChannelsConfig(this.config.dataSets);
    this.channels = Object.entries(channelsFieldsIndex).map(
      ([channelName, fields]) => {
        return new DataSetsChannel(channelName, this.dataSets, fields);
      },
    );
  }

  _initializeChannelsMasksPropagation() {
    this._defineProperties("channels");
    const updateTimeout = 10;
    const updateDataSetMasks = async (masks: Record<string, [aq.BitSet, aq.BitSet]>) => {
      const { dataSets } = this;
      const bitMasks = dataSets.map((ds) => ds.newFilterMask(true)) as [
        aq.BitSet,
        aq.BitSet,
      ];
      for (const channelMasks of Object.values(masks)) {
        bitMasks[0].and(channelMasks[0]);
        bitMasks[1].and(channelMasks[1]);
      }
      dataSets[0].visibilityFilter = bitMasks[0];
      dataSets[1].visibilityFilter = bitMasks[1];
    }
    const debouncedUpdateDataSetMasks = newDebounced(
      updateTimeout,
      updateDataSetMasks,
    );
    this.autorun(() => {
      const dataSetMasks = this.channels.reduce((dataSetMasks, channel) => {
        dataSetMasks[channel.channelName] = channel.getDataSetFilters();
        return dataSetMasks;
      }, {} as Record<string, [aq.BitSet, aq.BitSet]>);
      return () => debouncedUpdateDataSetMasks(dataSetMasks);
    });

    // --------------------
    const updateDataSetFilters = async (
      dataSetMasks: [aq.BitSet, aq.BitSet],
    ) => {
      for (const channel of this.channels) {
        channel.updateDataSetFilters(dataSetMasks);
      }
    };
    const debouncedUpdateDataSetFilters = newDebounced(
      updateTimeout,
      updateDataSetFilters,
    );
    this.autorun(() => {
      const dataSetMasks: [aq.BitSet, aq.BitSet] = [
        this.dataSets[0].filter,
        this.dataSets[1].filter,
      ];
      return () => debouncedUpdateDataSetFilters(dataSetMasks);
    });
  }
}
