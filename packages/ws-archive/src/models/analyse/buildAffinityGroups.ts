export interface TGroup {
  score: number;
  accumulatedScore: number;
  from: this[];
  to: this[];
}

export function buildAffinityGroups<K, Group extends TGroup>(
  affinityPairs: Iterable<[from: K, to: K, value: number]>,
  newGroup: (key: K) => Group = () => {
    return {
      score: 0,
      accumulatedScore: 0,
      from: [],
      to: [],
    } as unknown as Group;
  }
): Group[] {

  const index = new Map<K, Group>();

  const getGroup = (key: K): Group => {
    let group: Group | undefined = index.get(key);
    if (!group) {
      group = newGroup(key);
      index.set(key, group);
    }
    return group;
  }

  for (const [fromKey, toKey, value] of affinityPairs) {
    const from = getGroup(fromKey);
    const to = getGroup(toKey);
    from.to.push(to);
    to.from.push(from);
    // from.score += value;
    to.score += value;
  }

  function getMaxAffinity(groups: Group[], getGroupAffinity: (group: Group) => number) {
    let maxAffinity = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const affintity = getGroupAffinity(group);
      if (affintity > maxAffinity) {
        maxAffinity = affintity;
      }
    }
    return maxAffinity;
  }

  let groups = Array.from(index.values());

  // Calculate the maximum score
  const maxAffinity = getMaxAffinity(groups, (g) => g.score);

  // Normalize the affinities to be between 0 and 1
  const k = maxAffinity > 0 ? 1 / maxAffinity : 0;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    group.score *= k;
    group.accumulatedScore = group.score;
  }

  // Sort groups by score in the ascending order
  groups = groups.sort((a, b) => {
    return a.accumulatedScore - b.accumulatedScore;
  });

  // Calculate the accumulated affinities by propagating the
  // affinities from the children to the parents starting from the
  // groups with the lowest score
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const len = group.to.length;
    for (const parentGroup of group.to) {
      parentGroup.accumulatedScore += group.accumulatedScore / len;
    }
  }

  // Re-order the groups by accumulated score
  const maxAccumulatedAffinity = getMaxAffinity(groups, (g) => g.accumulatedScore);
  const maxK = maxAccumulatedAffinity > 0 ? 1 / maxAccumulatedAffinity : 0;
  // Normalize the cumulated affinities to be between 0 and 1
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    group.accumulatedScore *= maxK;
  }

  // Sort again by the accumulated score in the descending order
  const compareAccumulatedScoreDescending = (a: Group, b: Group) => {
    return b.accumulatedScore - a.accumulatedScore;
  }
  groups = groups.sort(compareAccumulatedScoreDescending);


  // // Re-order source and target groups by the accumulated score in  the descending order
  // const compareScoreDescending = (a: Group, b: Group) => {
  //   return b.score - a.score;
  // }
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    group.from = group.from.sort(compareAccumulatedScoreDescending);
    group.to = group.to.sort(compareAccumulatedScoreDescending);
  }

  return groups;
}