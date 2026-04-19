

import * as aq from "arquero";


/**
 * 
 * @param table - table with columns: sourceEntryId, targetEntryId, score
 * @param getDataSetIds - function that returns the data set ids for a given channel id
 * @returns a table with columns: id, dataset_1, dataset_2, children, parents, channelsValues, score
 */
export function buildGroupsTable(
  table: aq.ColumnTable,
  getDataSetIds: (channelId: number) => [dataSet1Ids: number[], dataSet2Ids: number[]]
): aq.ColumnTable {
  const group = buildGroupsHierarchy(table, getDataSetIds);
  return buildGroupsTreeTable(group);
}

// --------------------------------------------------------------------

function getScore(entry: { size: number }) {
  return entry.size === 0 ? 0 : 2 / (entry.size + 1);
}
class GroupEntry {
  static groupIdCounter = 0;
  type: "merge" | "intersection" | "group" = "group";

  id: number;

  #children: Record<number, GroupEntry> = {};
  get children(): GroupEntry[] {
    return Object.values(this.#children);
  }
  #parents: Record<number, GroupEntry> = {};
  get parents(): GroupEntry[] {
    return Object.values(this.#parents);
  }
  #channelIds: Record<number, number> = {};
  get channelIds(): number[] {
    return Object.keys(this.#channelIds).map(Number);
  }
  get size() {
    return this.dataSetsIds[0].length + this.dataSetsIds[1].length;
  }
  get score(): number {
    return getScore(this);
  }

  dataSetsIds: [number[], number[]];
  get stats() {
    return this.dataSetsIds.map((ids) => ids.length);
  }
  constructor(options: Partial<GroupEntry>) {
    this.id = GroupEntry.groupIdCounter++;
    this.addChannelsIds(...(options.channelIds || []));

    this.dataSetsIds = options.dataSetsIds || [[], []];
    // this.score = options.score || 0;
    for (const child of options.children || []) {
      this.addChild(child);
    }
    for (const parent of options.parents || []) {
      parent.addChild(this);
    }
  }
  addChannelsIds(...channelIds: number[]) {
    for (const channelId of channelIds) {
      this.#channelIds[channelId] = 1;
    }
  }
  addChild(group: GroupEntry) {
    this.#children[group.id] = group;
    group.#parents[this.id] = this;
  }

  mergeWith(group: GroupEntry) {
    this.addChannelsIds(...group.channelIds);
    delete this.#children[group.id];
    delete this.#parents[group.id];
    delete group.#children[this.id];
    delete group.#parents[this.id];
    for (const parent of group.parents) {
      delete parent.#children[group.id];
      parent.#children[this.id] = this;
    }
    for (const child of group.children) {
      delete child.#parents[group.id];
      child.#parents[this.id] = this;
    }
  }
}

// Description of the algorithm:
// 1. Get a pair of values in the order of the score (desc). Then pair is "N-M"
// 2. For each value (N and M) get the corresponding groups - Gn and Gm
// 3. If values are not associated with a group, create new groups (N -> Gn, M -> Gm)
// 4. Now we have two groups Gn and Gm.
// 5. Create intesection between the groups - Gn and Gm. It will create three possible subgroups:
//    a) "Gn-Gm" - the first group without the second
//    b) "Gm&Gn" - the intersection of elements between the two groups
//    c) "Gm-Gn" - the second group without the first
// 6. If the intersection "Gm&Gn" is not empty, create a new group with the intersection
//    and add it as a child to the both parent groups (Gn and Gm)
// 7. If the "Gn-Gm" is not empty, create a new group with the elements
//    and add this group as a child to the Gn
//    If it is empty then this new group is replaced by the Gn.
// 8. If the "Gm-Gn" is not empty, create a new group with the elements
//    and add this group as a child to the Gm.
//    If it is empty then this new group is replaced by the Gm.
// 9. If the intersection "Gm&Gn" is not empty, but the "Gn-Gm" or "Gm-Gn"
//    are empty then the Gm and Gm groups are merged together.
// 10. Repeat the steps 1-9 until all pairs are processed
function buildGroupsHierarchy(table: aq.ColumnTable, getDataSetIds: (channelId: number) => [dataSet1Ids: number[], dataSet2Ids: number[]]) {
  const getId1 = table.getter("sourceEntryId");
  const getId2 = table.getter("targetEntryId");
  const getScore = table.getter("score");

  const valuesIndex: Record<number, GroupEntry> = {};
  const rootGroup = new GroupEntry({});

  const newGroup = (
    {
      channelIds = [],
    }: {
      channelIds?: number[];
    },
    ...parentGroups: GroupEntry[]
  ): GroupEntry => {
    const dataSetsIds = getDataSetIds(channelIds[0]);
    return new GroupEntry({
      id: -1,
      channelIds,
      dataSetsIds,
      parents: parentGroups.length ? parentGroups : [rootGroup],
    });
  };

  let numberOfMerges = 0;
  let numberOfSplits = 0;
  const numberOfPairs = table.numRows();
  for (let i = 0; i < numberOfPairs; i++) {
    // const score = getScore(i);

    const id2 = getId2(i);
    if (!valuesIndex[id2]) {
      valuesIndex[id2] = newGroup({
        channelIds: [id2],
        // score,
      });
    }
    const group2 = valuesIndex[id2];

    const id1 = getId1(i);
    if (!valuesIndex[id1]) {
      valuesIndex[id1] = newGroup(
        {
          channelIds: [id1],
          // score,
        },
        group2,
      );
    }
    const group1 = valuesIndex[id1];

    const intersections = getIdsIntersections(
      group1.dataSetsIds,
      group2.dataSetsIds,
    );

    // Merge groups when groups are similar
    const compareResults = [
      intersections[0][0].length + intersections[0][1].length, // Gn-Gm
      intersections[1][0].length + intersections[1][1].length, // Gm&Gn
      intersections[2][0].length + intersections[2][1].length, // Gm-Gn
    ];

    // console.log("* IDS:", id1, id2, group1, group2, compareResults);

    // Both sets of IDs are the same - merge results
    if (compareResults[0] === 0 && compareResults[2] === 0) {
      group1.mergeWith(group2);
      valuesIndex[id1] = group1;
      valuesIndex[id2] = group1;
      group1.addChannelsIds(id1, id2);
      // delete valuesIndex[id2];

      group1.dataSetsIds = intersections[1];
      numberOfMerges++;
      group1.type = "merge";
    } else if (
      intersections[1][0].length > 0 &&
      intersections[1][1].length > 0
    ) {
      const commonDataSetsIds = intersections[1];
      if (
        compareResults[0] === 0
        // group1.dataSetsIds[0].length === commonDataSetsIds[0].length &&
        // group1.dataSetsIds[1].length === commonDataSetsIds[1].length
      ) {
        group1.addChannelsIds(id2);
        group2.addChild(group1);
      } else if (
        compareResults[1] === 0
        // group2.dataSetsIds[0].length === commonDataSetsIds[0].length &&
        // group2.dataSetsIds[1].length === commonDataSetsIds[1].length
      ) {
        group2.addChannelsIds(id1);
        group1.addChild(group2);
      } else {
        // Create a new group with the intersection and add it as the child to the parent groups
        const intersectionGroup = newGroup({}, group1, group2);
        intersectionGroup.addChannelsIds(id1, id2);
        intersectionGroup.dataSetsIds = commonDataSetsIds;
        intersectionGroup.type = "intersection";
        numberOfSplits++;
        // console.log("* Intersection:", id1, id2, intersectionGroup);
      }
    }

    // Both entities are already associated with groups
    if (group1 && group2) {
    }
  }
  // console.log({ numberOfMerges, numberOfSplits });
  // console.log("*", rootGroup);
  return rootGroup;
}


function getIdsIntersections(
  ids1: [number[], number[]],
  ids2: [number[], number[]],
): [[number[], number[]], [number[], number[]], [number[], number[]]] {
  const firstChannelsIds: [number[], number[]] = [[], []];
  const commonIds: [number[], number[]] = [[], []];
  const secondChannelsIds: [number[], number[]] = [[], []];
  for (let i = 0; i < 2; i++) {
    // Split the ids into three groups: firstChannelsIds, commonIds, secondChannelsIds
    splitIdsLists(
      ids1[i],
      ids2[i],
      firstChannelsIds[i],
      commonIds[i],
      secondChannelsIds[i],
    );
  }
  return [firstChannelsIds, commonIds, secondChannelsIds];

  function splitIdsLists(
    ids1: number[],
    ids2: number[],
    first: number[],
    common: number[],
    second: number[],
  ) {
    for (let i = 0, j = 0; i < ids1.length || j < ids2.length;) {
      const id1 = i < ids1.length ? ids1[i] : -1;
      const id2 = j < ids2.length ? ids2[j] : -1;
      if (id1 < 0) {
        for (; j < ids2.length; j++) {
          second.push(ids2[j]);
        }
        break;
      }
      if (id2 < 0) {
        for (; i < ids1.length; i++) {
          first.push(ids1[i]);
        }
        break;
      }
      if (id1 === id2) {
        common.push(id1);
        i++;
        j++;
      } else if (id1 < id2) {
        first.push(id1);
        i++;
      } else if (id2 < id1) {
        second.push(id2);
        j++;
      }
    }
  }
}

function buildGroupsTreeTable(group: GroupEntry): aq.ColumnTable {
  const tableOptions: {
    id: number[];
    dataset_1: number[][];
    dataset_2: number[][];
    children: number[][];
    parents: number[][];
    channelsValues: number[][];
    score: number[];
  } = {
    id: [],
    dataset_1: [],
    dataset_2: [],
    children: [],
    parents: [],
    channelsValues: [],
    score: [],
  };
  const groupEntriesIndex: Record<number, GroupEntry> = {};
  for (const {
    id,
    dataset_1,
    dataset_2,
    children,
    parents,
    channelsValues,
    score,
  } of visit(group)) {
    groupEntriesIndex[id] = group;
    tableOptions.id.push(id);
    tableOptions.dataset_1.push(dataset_1);
    tableOptions.dataset_2.push(dataset_2);
    tableOptions.children.push(children);
    tableOptions.parents.push(parents);
    tableOptions.channelsValues.push(channelsValues);
    tableOptions.score.push(score);
  }
  // Create an index of old group ids to new group ids (to table row numbers)
  const idsMapping: Record<number, number> = {};
  for (let i = 0; i < tableOptions.id.length; i++) {
    const currentGroupId = tableOptions.id[i];
    const currentGroup = groupEntriesIndex[currentGroupId];
    currentGroup.id = i;
    idsMapping[currentGroupId] = i;
    tableOptions.id[i] = i;
  }
  // Rename children and parents ids
  for (let i = 0; i < tableOptions.children.length; i++) {
    tableOptions.children[i] = tableOptions.children[i].map(
      (id) => idsMapping[id],
    );
  }
  //
  for (let i = 0; i < tableOptions.parents.length; i++) {
    tableOptions.parents[i] = tableOptions.parents[i].map(
      (id) => idsMapping[id],
    );
  }
  return aq.table(tableOptions);

  function* visit(
    group: GroupEntry,
    index: Record<number, boolean> = {},
  ): Generator<{
    id: number;
    dataset_1: number[];
    dataset_2: number[];
    children: number[];
    parents: number[];
    channelsValues: number[];
    score: number;
  }> {
    if (index[group.id]) {
      return;
    }
    index[group.id] = true;

    const row = {
      id: group.id,
      dataset_1: group.dataSetsIds[0],
      dataset_2: group.dataSetsIds[1],
      children: group.children.map((child) => child.id),
      parents: group.parents.map((parent) => parent.id),
      channelsValues: group.channelIds,
      score: group.score,
    };
    yield row;
    for (const child of group.children) {
      yield* visit(child, index);
    }
  }
}

