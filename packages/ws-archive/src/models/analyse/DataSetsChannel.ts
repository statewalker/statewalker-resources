import * as aq from "arquero";
import { newDebounced } from "../../lib/agen/debounce.js";
import { DataSet } from "./DataSet.js";
import { buildHistogram } from "./tools/buildHistogram.js";

export type DataSetConfig = {
  key: string;
  name: string;
  path: string;
  fields?: string[];
  channels: {
    [channelName: string]: {
      fields: string[];
    };
  };
};
export function getChannelsConfig(configs: [DataSetConfig, DataSetConfig]) {
  const channelsFieldsIndex: Record<string, [string[], string[]]> = {};
  for (const { channels = {} } of configs) {
    for (const channelName of Object.keys(channels)) {
      channelsFieldsIndex[channelName] = channelsFieldsIndex[channelName] ?? [
        [],
        [],
      ];
    }
  }
  for (const [channelName, fieldsList] of Object.entries(channelsFieldsIndex)) {
    fieldsList[0] = configs[0]?.channels?.[channelName]?.fields ?? [];
    fieldsList[1] = configs[1]?.channels?.[channelName]?.fields ?? [];
  }
  return channelsFieldsIndex;
}

export class DataSetsChannel extends DataSet {
  histogram: {
    min: number;
    max: number;
    data: Uint32Array;
    selected: Uint32Array;
  } = {
      min: 0,
      max: 0,
      data: new Uint32Array(0),
      selected: new Uint32Array(0),
    };

  observeHistogram = this.getObserver(() => this.histogram);

  get updateDelay() {
    return 10;
  }

  constructor(
    public channelName: string,
    public dataSets: [DataSet, DataSet],
    public fields: [string[], string[]],
  ) {
    super(aq.table({
      dataset_1: [],
      dataset_2: [],
      score: [],
      sum: [],
      value: []
    }), {
      searchFields: ["value"],
    });
    // this.name = name;
    this.fields = fields;

    this._initializeFieldsValuesIndexes();

    // Initialize back indexes
    this._initializeInvertedIndexes();

    // Initialize score range
    this._initializeScoreRange();


    // Initialize statistics for individual channel values
    this._initializeStats();

    // Initialize histograms reloading on filters updates
    this._initializeHistograms();
  }

  // ---------------------------------------------------------------------------
  // DataSet filters updates

  getChannelValuesFilters(...excludedChannels: string[]) {
    const excluded = new Set(excludedChannels);
    const filter = this.newFilterMask(true);
    for (const [name, mask] of Object.entries(this._filtersIndex)) {
      if (excluded.has(name)) {
        continue;
      }
      filter.and(mask);
    }
    return filter;
  }

  /**
   * Returns the DataSet filters selecting the records that are visible in this channel.
   */
  getDataSetFilters() {
    const filter = this.getChannelValuesFilters("groupsVisibilityFilter");
    const { table, dataSets } = this;
    const bitMasks = dataSets.map((ds) => ds.newFilterMask(false)) as [
      aq.BitSet,
      aq.BitSet,
    ];
    // Getters for rowids in DataSet 1 and DataSet 2 providing the row indexes
    // for each found group
    const getters = [table.getter("rowid_1"), table.getter("rowid_2")];
    for (let i = filter.next(0); i >= 0; i = filter.next(i + 1)) {
      const dataSet1Ids = (getters[0](i) || []) as number[];
      for (const id of dataSet1Ids) {
        bitMasks[0].set(id);
      }
      const dataSet2Ids = (getters[1](i) || []) as number[];
      for (const id of dataSet2Ids) {
        bitMasks[1].set(id);
      }
    }
    return bitMasks;
  }

  updateDataSetFilters(datasetVisibilityFilters: [aq.BitSet, aq.BitSet]) {
    // Visibility filters for this DataSet
    const groupsVisibilityFilter = this.newFilterMask(false);
    // const size = this.table.numRows();
    // const statsColumns = {
    //   dataset_1: new Uint32Array(size),
    //   dataset_2: new Uint32Array(size),
    // }
    // groupsVisibilityFilter.and(this.filter);
    {
      const filter = datasetVisibilityFilters[0];
      const recordsToGroups = this.recordsToGroups[0];
      if (filter) {
        for (let i = filter.next(0); i >= 0; i = filter.next(i + 1)) {
          const groupIds = recordsToGroups[i] || [];
          for (const groupId of groupIds) {
            groupsVisibilityFilter.set(groupId);
            // statsColumns.dataset_1[groupId]++;
          }
        }
      }
    }
    {
      const filter = datasetVisibilityFilters[1];
      const recordsToGroups = this.recordsToGroups[1];
      if (filter) {
        for (let i = filter.next(0); i >= 0; i = filter.next(i + 1)) {
          const groupIds = recordsToGroups[i] || [];
          for (const groupId of groupIds) {
            groupsVisibilityFilter.set(groupId);
            // statsColumns.dataset_2[groupId]++;
          }
        }
      }
    }
    this._updateMainFilter({
      groupsVisibilityFilter,
    });
    this._updateStatsTable({ filter: this.filter, dataSetMasks: datasetVisibilityFilters });
    // this.statsTable = aq.table(statsColumns).create({ filter });
    // ---------------------------------------------------------
  }

  // ---------------------------------------------------------------------------

  _scoreFilter: aq.BitSet | undefined;
  _initializeScoreRange() {
    this._defineProperties("_scoreRange", "_scoreFilter");

    const updateScoreRangeMask = async (scoreRange: [number, number]) => {
      const getter = this.table.getter("score") as (i: number) => number;
      const scoreFilter = this.newFilterMask(false);
      for (let i = 0, len = this.table.numRows(); i < len; i++) {
        const score = getter(i);
        if (score >= scoreRange[0] && score <= scoreRange[1]) {
          scoreFilter.set(i);
        }
      }
      this._scoreFilter = scoreFilter;
      this._updateMainFilter({
        scoreFilter,
      });
    };

    const debouncedUpdateScoreRangeMask = newDebounced(
      this.updateDelay,
      updateScoreRangeMask,
    );
    this.autorun(() => {
      const scoreRange = this._scoreRange;
      return () => debouncedUpdateScoreRangeMask(scoreRange);
    });
  }

  _scoreRange: [number, number] = [0, 1];
  get scoreRange() {
    return this._scoreRange;
  }
  set scoreRange(value: [number, number]) {
    if (!Array.isArray(value) || value.length !== 2) {
      return;
    }
    let range = [
      Math.min(value[0], value[1]),
      Math.max(value[0], value[1]),
    ] as [number, number];
    const { min, max } = this.histogram;
    range = [Math.max(range[0], min), Math.min(range[1], max)];

    if (this._scoreRange[0] === range[0] && this._scoreRange[1] === range[1]) {
      return;
    }
    this._scoreRange = range;
  }
  observeScoreRange = this.getObserver(() => this.scoreRange);

  // ---------------------------------------------------------------------------
  _initializeFieldsValuesIndexes() {
    const tables = this.dataSets.map((ds, idx) => {
      const columnNames = new Set(ds.tableColumns);
      const channelFields = this.fields[idx];
      const existingFields = channelFields.filter((f) => columnNames.has(f));
      if (existingFields.length !== channelFields.length) {
        throw new Error(
          `Wrong fields. DataSet ${idx + 1}. \n
          Expected:  "${channelFields.join('", "')}". 
          Found: "${existingFields.join('", "')}".`,
        );
      }

      // Build the direct table and fill the inverted index
      const rowidName = `rowid_${idx + 1}`;
      if (!existingFields.length) {
        return aq.table({
          rowid: [],
          value: [],
          [rowidName]: [],
        });
      }
      let table = ds.table.select({
        rowid: rowidName,
        [existingFields[0]]: "value",
      });
      for (let i = 1; i < existingFields.length; i++) {
        table.concat(
          ds.table.select({
            rowid: rowidName,
            [existingFields[i]]: "value",
          }),
        );
      }
      table = table
        .groupby("value")
        .rollup({
          [rowidName]: aq.op.array_agg(rowidName),
        })
        .orderby("value");
      return table;
    });

    const [t1, t2] = tables;
    this.table = t1
      .join_full(t2, "value")
      .orderby("value")
      .derive({
        dataset_1: (d: { rowid_1?: unknown[] }) => (d.rowid_1 || []).length,
        dataset_2: (d: { rowid_2?: unknown[] }) => (d.rowid_2 || []).length,
        score: (d: { rowid_1?: unknown[]; rowid_2?: unknown[] }) => {
          const len1 = (d.rowid_1 || []).length;
          const len2 = (d.rowid_2 || []).length;
          return len1 > 0 && len2 > 0 ? 1 / (len1 * len2) : 0;
        },
        sum: (d: { rowid_1?: unknown[]; rowid_2?: unknown[] }) =>
          (d.rowid_1 || []).length + (d.rowid_2 || []).length,
      })
      .orderby(aq.desc("score"), "sum", "value");
  }

  // ---------------------------------------------------------------------------
  /**
   * The statistics table contains the number of records in each group for each
   * data set.
   */
  statsTable: aq.ColumnTable = aq.table({
    dataset_1: new Uint32Array(0),
    dataset_2: new Uint32Array(0),
  });



  _updateStatsTable({ filter, dataSetMasks }: { filter: aq.BitSet, dataSetMasks: aq.BitSet[] }) {

    // TODO : overoad the 
    // protected _createFilteredTable(filter: aq.BitSet): aq.ColumnTable
    // method to create the filtered table.
    // The resulting table should contain stats 

    // Getters for rowids in DataSet 1 and DataSet 2 providing the row indexes
    // for each found group
    const { table } = this;
    const getters = [table.getter("rowid_1"), table.getter("rowid_2")];
    const size = this.table.numRows();
    const statsColumns = {
      dataset_1: new Uint32Array(size),
      dataset_2: new Uint32Array(size),
    }
    for (let i = filter.next(0); i >= 0; i = filter.next(i + 1)) {
      const dataSet1Ids = (getters[0](i) || []) as number[];
      const mask1 = dataSetMasks[0];
      let dataSet1Count = 0;
      for (const id of dataSet1Ids) {
        if (mask1.get(id)) {
          dataSet1Count++;
        }
      }
      statsColumns.dataset_1[i] = dataSet1Count;

      const dataSet2Ids = (getters[1](i) || []) as number[];
      const mask2 = dataSetMasks[1];
      let dataSet2Count = 0;
      for (const id of dataSet2Ids) {
        if (mask2.get(id)) {
          dataSet2Count++;
        }
      }
      statsColumns.dataset_2[i] = dataSet2Count;
    }
    this.statsTable = aq.table(statsColumns).create({ filter });
  }


  _initializeStats() {
    this._defineProperties("statsTable");
    /* * /
    const updateStats = async (filter: aq.BitSet) => {
      const dataSetMasks = this.getDataSetFilters();
      this._updateStatsTable({ filter, dataSetMasks });
    };

    // const debouncedUpdateStats = newDebounced(
    //   this.updateDelay,
    //   updateStats,
    // );

    this.autorun(() => {
      const filter = this.filter;
      return () => updateStats(filter);
    });
    // */
  }

  // ---------------------------------------------------------------------------

  _initializeHistograms() {
    this._defineProperties("histogram");
    const numBins = 100;
    const updateHistogram = async (
      filter: aq.BitSet | undefined = undefined,
    ) => {
      const length = this.table.numRows();
      const full = this.table.getter("score") as (i: number) => number;
      const selected = filter ? (i: number) => !!filter.get(i) : () => true;
      this.histogram = buildHistogram({
        full,
        selected,
        length,
        numBins,
      });
    };
    this.autorun(() => {
      const filter = this.filter;
      return () => updateHistogram(filter);
    });

    // See https://observablehq.com/@uwdata/arquero-cookbook#histogram
    // this.histogram = this.table
    //   .groupby({ bin: aq.bin("score") })
    //   .count()
    //   .impute(
    //     { count: () => 0 }, // set imputed counts to zero
    //     {
    //       expand: {
    //         bin: (d: { bin: number }) => aq.op.sequence(...aq.op.bins(d.bin)),
    //       },
    //     }, // include rows for all bin values
    //   )
    //   .orderby("bin");
  }

  // ---------------------------------------------------------------------------
  // Inverted indexes for each DataSet
  // The indexes are used to quickly find the groups of records in this cannel
  // for each row the DataSet.
  recordsToGroups: [number[][], number[][]] = [[], []];
  _initializeInvertedIndexes() {
    this.recordsToGroups[0] = getInvertedIndex(
      this.dataSets[0],
      this.table,
      "rowid_1",
    );
    this.recordsToGroups[1] = getInvertedIndex(
      this.dataSets[1],
      this.table,
      "rowid_2",
    );

    function getInvertedIndex(
      dataSet: DataSet,
      table: aq.ColumnTable,
      rowidName: string,
    ) {
      const recordsToGroups = new Array<number[]>(dataSet.table.numRows());
      const getter = table.getter(rowidName) as (i: number) => number[] | null;
      for (let i = 0, len = table.numRows(); i < len; i++) {
        const rowid = getter(i);
        if (!rowid) {
          continue;
        }
        for (const r of rowid) {
          if (!recordsToGroups[r]) {
            recordsToGroups[r] = [];
          }
          const indexes = recordsToGroups[r];
          indexes.push(i);
        }
      }
      return recordsToGroups;
    }
  }

  /**
   * Get the group ids for the given data set ids and returns a map of group ids to the number of records in the group.
   * @param  dataSet1Ids - list of ids for the first dataset
   * @param  dataSet2Ids - list of ids for the second dataset
   * @returns a map of group ids to the number of records in the group.
   */
  getGroupIds(
    dataSet1Ids: number[],
    dataSet2Ids: number[],
  ): Record<number, [number, number]> {
    const dataSetIdsList = [dataSet1Ids, dataSet2Ids];
    const resultingGroups: Record<number, [number, number]> = {};
    for (let ds = 0; ds < this.recordsToGroups.length; ds++) {
      const recordsToGroups = this.recordsToGroups[ds];
      const dataSetIds = dataSetIdsList[ds];
      for (const dataSetId of dataSetIds) {
        const groupIds = recordsToGroups[dataSetId] || [];
        for (const groupId of groupIds) {
          if (!resultingGroups[groupId]) {
            resultingGroups[groupId] = [0, 0];
          }
          const counters = resultingGroups[groupId];
          counters[ds]++;
        }
      }
    }
    for (const id in resultingGroups) {
      const group = resultingGroups[id];
      if (group[0] === 0 || group[1] === 0) {
        delete resultingGroups[id];
      }
    }
    return resultingGroups;
  }
}
