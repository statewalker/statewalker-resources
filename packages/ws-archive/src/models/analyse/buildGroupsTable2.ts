import * as aq from "arquero";
import { type TGroup, buildAffinityGroups } from "./buildAffinityGroups.js";
import { HashIndex } from "./tools/HashIndex.js";
import { compareOrderedLists } from "./tools/compareOrderedLists.js";
import { hashCodeForNumbers } from "./tools/hash.js";
import { splitOrderedLists } from "./tools/splitOrderedLists.js";

function newDataSetIdsHashIndex<V = number>() {
  function compare<T>(a: T[], b: T[]): number {
    const len = Math.min(a.length, b.length);
    let result = 0;
    for (let i = 0; result === 0 && i < len; i++) {
      result = a[i] < b[i] ? -1 : a[i] > b[i] ? 1 : 0;
    }
    return result || a.length - b.length;
  }
  const index = new HashIndex<[number[], number[]], V>(
    (key) =>
      hashCodeForNumbers([
        hashCodeForNumbers(key[0]),
        hashCodeForNumbers(key[1]),
      ]),
    (a, b) => {
      const result = compare(a[0], b[0]);
      return result === 0 ? compare(a[1], b[1]) : result;
    },
  );
  return index;
}

/**
 *
 * @param table - table with columns: sourceEntryId, targetEntryId, score
 * @param getDataSetIds - function that returns the data set ids for a given channel id
 * @returns a table with columns: id, dataset_1, dataset_2, children, parents, channelsValues, score
 */
export function buildGroupsTable(
  table: aq.ColumnTable,
  getDataSetIds: (
    channelId: number,
  ) => [dataSet1Ids: number[], dataSet2Ids: number[]],
): aq.ColumnTable {
  interface ChannelsValuesGroup extends TGroup {
    dataSetsIds: [number[], number[]];
    channelsValues: number[];
  }

  function* getAffinityGroups() {
    const getId1 = table.getter("sourceEntryId") as (i: number) => number;
    const getId2 = table.getter("targetEntryId") as (i: number) => number;
    const getScore = table.getter("score") as (i: number) => number;
    const len = table.numRows();
    for (let i = 0; i < len; i++) {
      const id1 = getId1(i);
      const id2 = getId2(i);
      const score = getScore(i);
      yield [id1, id2, score] as [number, number, number];
    }
  }

  const start = Date.now();
  const graph = buildAffinityGroups(
    getAffinityGroups(),
    (channelValueId: number): ChannelsValuesGroup => {
      const dataSetsIds = getDataSetIds(channelValueId);
      return {
        score: 0,
        accumulatedScore: 0,
        from: [],
        to: [],
        dataSetsIds,
        channelsValues: [channelValueId],
      };
    },
  );

  // Attribute ids and accumulated score to groups

  const groups: ChannelsValuesGroup[] = [];
  // Build the groups table;
  for (let i = 0; i < graph.length; i++) {
    const group = graph[i];
    group.score = group.accumulatedScore;
    groups.push(group);
  }

  // Build the groups hierarchy. The accumulated score is used to determine
  // the parent group. The root group is the one with the highest accumulated score.

  function newTableOptions(len = 0): {
    id: number[];
    dataset_1: number[][];
    dataset_2: number[][];
    children: number[][];
    parents: number[][];
    channelsValues: number[][];
    score: number[];
  } {
    return {
      id: new Array(len).map((_, i) => i),
      dataset_1: new Array(len).map(() => []),
      dataset_2: new Array(len).map(() => []),
      children: new Array(len).map(() => []),
      parents: new Array(len).map(() => []),
      channelsValues: new Array(len).map(() => []),
      score: new Array(len).fill(0),
    };
  }

  const tableOptions = newTableOptions();
  const groupsIndex = new Map<ChannelsValuesGroup, number>();
  function getGroupId(group: ChannelsValuesGroup) {
    let idx = groupsIndex.get(group);
    if (idx === undefined) {
      idx = tableOptions.id.length;
      tableOptions.id.push(idx);
      tableOptions.dataset_1.push(group.dataSetsIds[0]);
      tableOptions.dataset_2.push(group.dataSetsIds[1]);
      tableOptions.channelsValues.push([...group.channelsValues]);
      tableOptions.score.push(group.accumulatedScore);
      tableOptions.children.push([]);
      tableOptions.parents.push([]);
      groupsIndex.set(group, idx);
    }
    return idx;
  }
  function addParentChildRelation(
    group: ChannelsValuesGroup,
    parent: ChannelsValuesGroup,
  ) {
    const groupId = getGroupId(group);
    const parentId = getGroupId(parent);
    tableOptions.parents[groupId].push(parentId);
    tableOptions.children[parentId].push(groupId);
  }

  function expandChannelsValues(
    group: ChannelsValuesGroup,
    channelsValues: number[],
  ) {
    const groupId = getGroupId(group);
    const groupValues = tableOptions.channelsValues[groupId];
    const newChannelsValues = [
      ...new Set([...groupValues, ...channelsValues]),
    ].sort();
    tableOptions.channelsValues[groupId] = newChannelsValues;
  }
  // Create the root group

  const rootValuesGroup: ChannelsValuesGroup = {
    dataSetsIds: [[], []],
    channelsValues: [],
    score: 0,
    accumulatedScore: 0,
    from: [],
    to: [],
  };
  getGroupId(rootValuesGroup); // Associate the id=0 to the root group

  let t = 0;
  for (let i = 0; i < graph.length; i++) {
    const group = graph[i];
    getGroupId(group);

    let parent: ChannelsValuesGroup | undefined;
    let parentIntersectionSize = 0;
    for (const to of group.to) {
      const intersections = getIdsIntersections(
        group.dataSetsIds,
        to.dataSetsIds,
      );
      const compareResults = [
        intersections[0][0].length + intersections[0][1].length, // Gn-Gm
        intersections[1][0].length + intersections[1][1].length, // Gm&Gn
        intersections[2][0].length + intersections[2][1].length, // Gm-Gn
      ];
      if (compareResults[1] === 0) {
        continue;
      }

      /* */
      // const isParent = compareResults[1] > parentIntersectionSize;
      const isParent =
        compareResults[1] > parentIntersectionSize &&
        to.accumulatedScore > group.accumulatedScore;
      if (isParent) {
        parentIntersectionSize = compareResults[1];
        parent = to;
        addParentChildRelation(group, parent);
      }
      /* ---- */

      t++;
      if (compareResults[0] === 0 && compareResults[2] === 0) {
        addParentChildRelation(group, to);
        parent = to;
      }
      if (compareResults[0] === 0) {
        expandChannelsValues(group, to.channelsValues);
      }
      if (compareResults[2] === 0) {
        expandChannelsValues(to, group.channelsValues);
      }
    }
    if (!parent) {
      addParentChildRelation(group, rootValuesGroup);
    }
  }

  // ------------------------------------------------
  // Remove duplicates from the channelsValues
  // TODO: use the Jaccard similarity to choose a parent of the merged group between
  // Use the MinHash lib to estimate Jaccard similarity based on hashes:
  // https://github.com/duhaime/minhash
  // (it requires changes to use numbers instead of strings)
  // ------------------------------------------------
  const dataSet1Ids = tableOptions.dataset_1;
  const dataSet2Ids = tableOptions.dataset_2;
  const hashIndex = newDataSetIdsHashIndex<number[]>();
  const newIndexArray = () => [] as number[];
  const length = dataSet1Ids.length;
  for (let i = 0; i < length; i++) {
    const indexes = hashIndex.getOrAdd(
      [dataSet1Ids[i], dataSet2Ids[i]],
      newIndexArray,
    );
    indexes.push(i);
  }

  // We want to keep the order of the groups,
  // so we need to sort the entries by
  // the group ids. The smallest group ids correspond to the
  // biggest groups.
  let entries = hashIndex.entries();
  for (const entry of entries) {
    entry[1] = entry[1].sort((a, b) => a - b);
  }
  entries = entries.sort((a, b) => {
    // Sort by the first group id. Smallest group id first (biggest group)
    return a[1][0] - b[1][0];
  });

  // To keep the order of the groups, we need to sort the entries by the
  // smallest group id

  // ---------------------------------------
  // Build mapping of old group ids to new ids
  const idsMapping: Record<number, number> = {};
  idsMapping[0] = 0;
  for (let newId = 0, len = entries.length; newId < len; newId++) {
    const ids = entries[newId][1];
    for (const id of ids) {
      idsMapping[id] = idsMapping[id] ?? newId;
    }
  }

  // ---------------------------------------
  // Remap the references to the new ids
  const remappedTableOptions = newTableOptions();
  for (let newId = 0, len = entries.length; newId < len; newId++) {
    const [dataSetIds, ids] = entries[newId];
    remappedTableOptions.id.push(newId);
    remappedTableOptions.dataset_1.push(dataSetIds[0]);
    remappedTableOptions.dataset_2.push(dataSetIds[1]);

    const channelsValuesIds = new Set<number>();
    const childrenIds = new Set<number>();
    const parentsIds = new Set<number>();
    for (const id of ids) {
      // const remappedId = idsMapping[id];

      // Add the channels values of the group to the new group
      for (const childId of tableOptions.children[id]) {
        const newChildId = idsMapping[childId];
        if (newChildId !== newId) {
          childrenIds.add(newChildId);
        }
      }

      // Parents ids
      for (const parentId of tableOptions.parents[id]) {
        const newParentId = idsMapping[parentId];
        if (newParentId !== newId) {
          parentsIds.add(newParentId);
        }
      }

      // Add the channels values of the group to the new group
      const valuesId = tableOptions.channelsValues[id];
      for (const valueId of valuesId) {
        channelsValuesIds.add(valueId);
      }
    }
    remappedTableOptions.channelsValues.push([...channelsValuesIds]);
    remappedTableOptions.parents.push([...parentsIds]);
    remappedTableOptions.children.push([]);
    // remappedTableOptions.children.push([...childrenIds]);
    remappedTableOptions.score.push(tableOptions.score[ids[0]]);
  }

  // ---------------------------------------
  // Returns the similarity score between two groups
  // The similarity score is calculated based on the number of common elements relative to
  // the number of all possible elements (Jaccard similarity).
  function getSimilarityScore(a: number[], b: number[]) {
    // // The score below is not really a Jaccard similarity, but it is a good approximation
    // // - it calculates the similarity based on the number of common elements
    // // and the number of added elements. The removed elements are not taken into account.
    // // The "removed" elements correspond to elements specific for the child group.
    // // The "added" elements correspond to elements specific for the parent group.
    // // The common elements are the ones that are shared between the two groups.
    // const [, common, added] = compareOrderedLists(a, b);
    // return common / (common + added);

    // Pure Jaccard similarity:
    const [removed, common, added] = compareOrderedLists(a, b);
    return common / (removed + common + added);
  }

  // Select the nearest parent group based on similarity.
  function getGroupsSimilarity(id1: number, id2: number) {
    const groupsValuesSimilarity = getSimilarityScore(
      remappedTableOptions.channelsValues[id1],
      remappedTableOptions.channelsValues[id2],
    );
    const groupsIds1Similarity = getSimilarityScore(
      remappedTableOptions.dataset_1[id1],
      remappedTableOptions.dataset_1[id2],
    );
    const groupsIds2Similarity = getSimilarityScore(
      remappedTableOptions.dataset_2[id1],
      remappedTableOptions.dataset_2[id2],
    );
    return (
      groupsValuesSimilarity * 0.3 +
      groupsIds1Similarity * 0.3 +
      groupsIds2Similarity * 0.3
    );
  }

  let maxSimilarity = 0;
  let minSimilarity = 1;
  let avgSimilarity = 0;
  const similarities = [] as { parentId: number; similarity: number }[];
  for (let id = remappedTableOptions.parents.length - 1; id >= 0; id--) {
    const parentIds = remappedTableOptions.parents[id];
    const similaritiesWithParent = parentIds
      .map((parentId) => {
        const similarity = getGroupsSimilarity(id, parentId);
        return { parentId, similarity };
      })
      .sort((a, b) => b.similarity - a.similarity);
    const bestParentSimilarity = similaritiesWithParent[0] ?? {
      parentId: 0,
      similarity: 0,
    };
    // const parentId = bestParentSimilarity.parentId;
    // remappedTableOptions.parents[id] = [parentId];
    // remappedTableOptions.children[parentId].push(id);

    similarities.unshift(bestParentSimilarity);
    const sim = bestParentSimilarity.similarity;
    maxSimilarity = Math.max(maxSimilarity, sim);
    minSimilarity = Math.min(minSimilarity, sim);
    avgSimilarity += sim;
  }
  avgSimilarity = avgSimilarity / remappedTableOptions.parents.length;
  console.log("similarities", minSimilarity, maxSimilarity, avgSimilarity);

  for (let id = remappedTableOptions.parents.length - 1; id >= 0; id--) {
    const { parentId, similarity } = similarities[id];
    // parentId = similarity > avgSimilarity ? parentId : 0;
    remappedTableOptions.parents[id] = [parentId];
    remappedTableOptions.children[parentId].push(id);
  }

  const end = Date.now();

  console.log(`Groups (${end - start}ms)`, groups);

  const resultingTable = aq.table(remappedTableOptions);

  /* * /{
    let idx = 0;
    const stack: number[] = []
    const iterator = visit({
      table: resultingTable,
      rootId: 0,
      begin: (id: number) => {
        const object = resultingTable.object(id);
        console.log(`${stack.map(() => ' ').join('')} - ${idx++}: `, object);
        stack.push(id);
      },
      end: (id: number) => {
        stack.pop();
        // const object = resultingTable.object(id);
        // console.log(`${stack.map(() => ' ').join('')} - END: `, object);
      },
    });
  }// */

  return resultingTable;

  function visit({
    table,
    rootId = 0,
    begin,
    end,
  }: {
    table: aq.ColumnTable;
    rootId?: number;
    begin: (id: number) => void;
    end: (id: number) => void;
  }) {
    const getChildren = table.getter("children") as (i: number) => number[];
    visitChildren(rootId);

    function visitChildren(id: number) {
      begin(id);
      const children = getChildren(id) ?? [];
      for (const childId of children) {
        visitChildren(childId);
      }
      end(id);
    }
  }
  // const group = buildGroupsHierarchy(table, getDataSetIds);
  // return buildGroupsTreeTable(group);
}

// --------------------------------------------------------------------

function getIdsIntersections(
  ids1: [number[], number[]],
  ids2: [number[], number[]],
): [[number[], number[]], [number[], number[]], [number[], number[]]] {
  const firstChannelsIds: [number[], number[]] = [[], []];
  const commonIds: [number[], number[]] = [[], []];
  const secondChannelsIds: [number[], number[]] = [[], []];
  [firstChannelsIds[0], commonIds[0], secondChannelsIds[0]] = splitOrderedLists(
    ids1[0],
    ids2[0],
  );
  [firstChannelsIds[1], commonIds[1], secondChannelsIds[1]] = splitOrderedLists(
    ids1[1],
    ids2[1],
  );
  return [firstChannelsIds, commonIds, secondChannelsIds];
}
