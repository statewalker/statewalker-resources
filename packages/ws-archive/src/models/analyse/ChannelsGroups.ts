import * as aq from "arquero";
import { newDebounced } from "../../lib/agen/debounce.js";
import { DataSet } from "./DataSet.js";
import type { DataSetsChannel } from "./DataSetsChannel.js";
// import { buildHistogram } from "./tools/buildHistogram.js";
import { TreeDataSet } from "./TreeDataSet.js";
// import { buildGroupsTable } from "./buildGroupsTable.js";
import { buildGroupsTable } from "./buildGroupsTable2.js";

function toGlobalGroupId(channelId: number, groupId: number): number {
  // groupId++;
  return 0xffffffffffff & (((0xf & channelId) << 24) | (0xffffff & groupId));
}

function fromGlobalGroupId(globalGroupId: number): [number, number] {
  const [channelId, groupId] = [
    (globalGroupId >>> 24) & 0xff,
    globalGroupId & 0xffffff,
  ];
  // groupId--;
  return [channelId, groupId];
}

/**
 * This class organizes the invidividual channel values in groups.
 */
export class ChannelsGroups extends DataSet {
  channels: DataSetsChannel[];

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
  tree: TreeDataSet = null!;

  constructor(channels: DataSetsChannel[]) {
    const tableOptions = {
      id: new Uint32Array(0),
      dataset_1: new Array<Uint32Array>(0),
      dataset_2: new Array<Uint32Array>(0),
      children: new Array<Uint32Array>(0),
      parents: new Array<Uint32Array>(0),
      ...Object.fromEntries(
        channels.map((channel) => [channel.channelName, new Uint32Array(0)]),
      ),
    };
    super(aq.table(tableOptions), { withRowId: true });
    this.channels = channels;

    const start = Date.now();

    const pairsCoocurrencies: aq.ColumnTable = this.buildCoocurrencePairs();
    // this.table = buildGroupsTable1(pairsCoocurrencies, (channelId: number) =>
    //   this.getDataSetIds(channelId),
    // );
    this.table = buildGroupsTable(pairsCoocurrencies, (channelId: number) =>
      this.getDataSetIds(channelId),
    );

    // this._initFilters();

    const end = Date.now();
    console.log("Time: ", end - start);

    // const numBins = 100;
    // const getter = this.table.getter("score") as (i: number) => number;

    // this.histogram = buildHistogram({
    //   full: getter,
    //   selected: getter,
    //   length: this.table.numRows(),
    //   numBins,
    //   min,
    //   max
    // });

    this._initializeTree();
    this._initializeChannelsValuesFiltering();
  }

  _initializeTree() {
    // -----------------------------------------------
    // Build tree
    // -----------------------------------------------
    {
      // Prepare getters and columns names
      const getters: ((i: number) => unknown)[] = [];
      const columns: Record<string, unknown[]> = {};
      const columnsNames = ["id", "parents", "dataset_1", "dataset_2", "score"];
      for (const name of columnsNames) {
        columns[name] = [];
        getters.push(this.table.getter(name));
      }

      const channelsGetters = new Map<
        DataSetsChannel,
        (i: number) => unknown
      >();
      const channelsNames: string[] = [];
      for (const channel of this.channels) {
        const channelName = channel.channelName;
        columns[channelName] = [];
        channelsNames.push(channelName);
        channelsGetters.set(channel, channel.table.getter("value"));
      }

      const getChannelValuesIds = this.table.getter("channelsValues");
      // Build columns for the tree
      for (let i = 0, len = this.table.numRows(); i < len; i++) {
        // Default columns
        for (let j = 0; j < getters.length; j++) {
          columns[columnsNames[j]].push(getters[j](i));
        }
        // Use reference to groups values to get the channels values
        const channelsIds = getChannelValuesIds(i);
        const visitedChannels: Record<string, boolean> = {};
        if (!Array.isArray(channelsIds)) {
          console.warn("Invalid channels values", i, len, channelsIds);
        }
        for (const channelId of channelsIds) {
          const [channel, valueId] = this.getGroupInfo(channelId);
          if (channel === undefined || valueId === undefined) {
            continue;
          }
          visitedChannels[channel.channelName] = true;
          const getter = channelsGetters.get(channel);
          columns[channel.channelName].push(getter?.(valueId));
        }
        for (const channelName of channelsNames) {
          if (!visitedChannels[channelName]) {
            columns[channelName].push(undefined);
          }
        }
      }

      const table = aq.table(columns);
      this.tree = new TreeDataSet(table, {
        parentsIdColumn: "parents",
      });
      this.tree.selectId(0);
    }

    this.autorun(() => {
      const selectedId = this.tree.selectedId;
      return () => this.activateGroupFilters(selectedId);
    });
  }

  /**
   * This field contains the groupIds and the corresponding scores.
   */
  groupsScores: Map<number, number> = new Map();
  observeGroupsScores = this.getObserver(() => this.groupsScores);

  _initializeChannelsValuesFiltering() {
    this._defineProperties("groupsScores");

    const updateChannelsValuesList = async (channelsFilters: aq.BitSet[]) => {
      const start = Date.now();

      const valueIds = channelsFilters.reduce((valueIds, filter, channelId) => {
        for (let i = filter.next(0); i >= 0; i = filter.next(i + 1)) {
          const valueId = toGlobalGroupId(channelId, i);
          valueIds.add(valueId);
        }
        return valueIds;
      }, new Set<number>());

      const getGroupValues = this.table.getter("channelsValues");
      const scoresList: [groupId: number, score: number][] = [];
      let maxScore = 0;
      for (
        let groupId = 0, len = this.table.numRows();
        groupId < len;
        groupId++
      ) {
        const valuesIds = getGroupValues(groupId) as number[];
        const score = valuesIds.reduce((score, valueId) => {
          return valueIds.has(valueId) ? score + 1 : score;
        }, 0);
        scoresList.push([groupId, score]);
        maxScore = Math.max(maxScore, score);
      }

      // Normalize the scores
      if (maxScore > 0) {
        for (let i = 0; i < scoresList.length; i++) {
          scoresList[i][1] /= maxScore;
        }
      }
      this.groupsScores = new Map<number, number>(scoresList);

      const end = Date.now();
      console.log(
        "Active group values: ",
        valueIds,
        this.groupsScores,
        "Time: ",
        end - start,
      );
    };
    const debouncedUpdateChannelsValuesList = newDebounced(
      100,
      updateChannelsValuesList,
    );
    this.autorun(() => {
      const channelsFilters = this.channels.map((channel) => channel.filter);
      return () => {
        debouncedUpdateChannelsValuesList(channelsFilters);
      };
    });
  }

  get channelsNames() {
    return this.channels.map((channel) => channel.channelName);
  }

  activateGroupFilters(groupId?: number) {
    const values = this.getGroupValues(groupId);
    if (!values) {
      return;
    }
    console.log("Activate group filters", values);
    for (const [channel, value] of values.entries()) {
      let searchQuery = String(value ?? "");
      if (searchQuery.length > 0 && searchQuery.length <= 3) {
        searchQuery = `^${searchQuery}$`;
      }
      channel.search(searchQuery);
    }
  }

  /**
   * Returns the score of a group with the given id. This score reflects the
   * number of channels that are selected in the group.
   * @param groupId the id of the group
   * @returns the score of the group
   */
  getGroupSelectiveScore(groupId: number): number {
    const channelsValues = this.table.get(
      "channelsValues",
      groupId,
    ) as number[];
    let score = 0;
    if (channelsValues) {
      for (const channelAbsId of channelsValues) {
        const [channel, groupId] = this.getGroupInfo(channelAbsId);
        if (!channel || groupId === undefined) {
          continue;
        }
        score += 1;
      }
    }
    score /= this.channels.length;
    return score;
  }

  /**
   * Returns the total number of dataset entries selected by a group with the given id. 
   * @param groupId the id of the group
   * @returns the number of dataset entries
   */
  getGroupSize(groupId: number): number {
    let score = 0;
    const channelsValues = this.table.get(
      "channelsValues",
      groupId,
    ) as number[];
    if (channelsValues) {
      for (const channelAbsId of channelsValues) {
        const [channel, channelGroupId] = this.getGroupInfo(channelAbsId);
        if (!channel || channelGroupId === undefined) {
          continue;
        }
        score += channel.table.get("rowid_1", channelGroupId)?.length ?? 0;
        score += channel.table.get("rowid_2", channelGroupId)?.length ?? 0;
      }
    }
    return score;
  }


  getGroupValues(groupId?: number): Map<DataSetsChannel, unknown> {
    const values = new Map<DataSetsChannel, unknown>();
    if (groupId !== undefined) {
      const channelsValues = this.table.get(
        "channelsValues",
        groupId,
      ) as number[];
      if (channelsValues) {
        for (const channelAbsId of channelsValues) {
          const [channel, groupId] = this.getGroupInfo(channelAbsId);
          if (!channel || groupId === undefined) {
            continue;
          }
          const channelValue = channel.table.get("value", groupId);
          channel && values.set(channel, channelValue);
        }
      }
    }
    for (const channel of this.channels) {
      if (!values.has(channel)) {
        values.set(channel, undefined);
      }
    }
    return values;
  }

  getGroupInfo(
    absGroupId?: number,
  ): [channel?: DataSetsChannel, groupId?: number] {
    if (absGroupId === undefined) {
      return [];
    }
    const [channelId, groupId] = fromGlobalGroupId(absGroupId);
    const channel = this.channels[channelId];
    if (!channel) {
      return [];
    }
    return [channel, groupId];
  }

  protected getDataSetIds(channelAbsId?: number): [number[], number[]] {
    const [channel, groupId] = this.getGroupInfo(channelAbsId);
    if (!channel || groupId === undefined) {
      return [[], []];
    }
    const dataSetIds1 = channel.table.get("rowid_1", groupId) as number[];
    const dataSetIds2 = channel.table.get("rowid_2", groupId) as number[];
    return [dataSetIds1, dataSetIds2];
  }

  protected buildCoocurrencePairs(): aq.ColumnTable {
    const sourceIds: number[] = [];
    const targetIds: number[] = [];
    const scores: number[] = [];
    for (
      let currentChannelId = 0;
      currentChannelId < this.channels.length;
      currentChannelId++
    ) {
      const currentChannel = this.channels[currentChannelId];
      // let len = 100;
      const len = currentChannel.table.numRows();
      for (
        let currentChannelValueId = 0;
        currentChannelValueId < len;
        currentChannelValueId++
      ) {
        //
        const dataSet1ValuesIds = currentChannel.table.get(
          "rowid_1",
          currentChannelValueId,
        ) as number[];
        const dataSet2ValuesIds = currentChannel.table.get(
          "rowid_2",
          currentChannelValueId,
        ) as number[];

        const absSourceGroupId = toGlobalGroupId(
          currentChannelId,
          currentChannelValueId,
        );

        const hasNonEmptyLinks =
          dataSet1ValuesIds?.length > 0 && dataSet2ValuesIds?.length > 0;
        if (!hasNonEmptyLinks) {
          continue;
        }

        // This index contains the number of links between the current value and values from others groups
        for (let channelId = 0; channelId < this.channels.length; channelId++) {
          if (channelId === currentChannelId) {
            continue;
          }
          const channel = this.channels[channelId];
          const channelRecordsIds = channel.getGroupIds(
            dataSet1ValuesIds,
            dataSet2ValuesIds,
          );
          for (const [targetGroupId, channelScores] of Object.entries(
            channelRecordsIds,
          )) {
            const channelScore = channelScores[0] + channelScores[1];
            const absTargetGroupId = toGlobalGroupId(channelId, +targetGroupId);
            sourceIds.push(absSourceGroupId);
            targetIds.push(absTargetGroupId);
            scores.push(channelScore);
            sourceIds.push(absTargetGroupId);
            targetIds.push(absSourceGroupId);
            scores.push(channelScore);
          }
        }
      }
    }

    const table = aq.table({
      sourceEntryId: sourceIds,
      targetEntryId: targetIds,
      score: scores,
    });

    return table
      .groupby("sourceEntryId", "targetEntryId")
      .rollup({ score: aq.op.sum("score") })
      .orderby(aq.desc("score"))
      .reify();
  }
}
