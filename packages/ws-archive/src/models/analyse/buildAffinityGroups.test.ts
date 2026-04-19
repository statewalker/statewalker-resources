import { describe, expect, it } from "vitest";
import { type TGroup, buildAffinityGroups } from "./buildAffinityGroups";

describe("buildAffinityGroups", () => {
  /* */
  it("should be able to generate score graph", async () => {
    test([
      ["A", "B", 1],
    ], [
      { key: 'B', score: 1, accumulatedScore: 1, from: ['A'], to: [] },
      { key: 'A', score: 0, accumulatedScore: 0, from: [], to: ['B'] }
    ]);

    test([
      ["A", "B", 1],
      ["A", "C", 1],
      ["A", "D", 1],
    ], [
      { key: 'B', score: 1, accumulatedScore: 1, from: ['A'], to: [] },
      { key: 'C', score: 1, accumulatedScore: 1, from: ['A'], to: [] },
      { key: 'D', score: 1, accumulatedScore: 1, from: ['A'], to: [] },
      {
        key: 'A',
        score: 0,
        accumulatedScore: 0,
        from: [],
        to: ['B', 'C', 'D']
      }
    ]);

    test([
      ["B", "A", 1],
      ["C", "A", 1],
      ["D", "A", 1],
    ], [
      {
        key: 'A',
        score: 1,
        accumulatedScore: 1,
        from: ['B', 'C', 'D'],
        to: []
      },
      { key: 'B', score: 0, accumulatedScore: 0, from: [], to: ['A'] },
      { key: 'C', score: 0, accumulatedScore: 0, from: [], to: ['A'] },
      { key: 'D', score: 0, accumulatedScore: 0, from: [], to: ['A'] }
    ]);

    test([
      ["C", "D", 1],
      ["A", "C", 1],
      ["B", "C", 1],
    ], [
      { key: 'D', score: 0.5, accumulatedScore: 1, from: ['C'], to: [] },
      {
        key: 'C',
        score: 1,
        accumulatedScore: 0.667,
        from: ['A', 'B'],
        to: ['D']
      },
      { key: 'A', score: 0, accumulatedScore: 0, from: [], to: ['C'] },
      { key: 'B', score: 0, accumulatedScore: 0, from: [], to: ['C'] }
    ]);

    test([
      ["A", "B", 1],
      ["B", "C", 1],
    ], [
      { key: 'C', score: 1, accumulatedScore: 1, from: ['B'], to: [] },
      {
        key: 'B',
        score: 1,
        accumulatedScore: 0.5,
        from: ['A'],
        to: ['C']
      },
      { key: 'A', score: 0, accumulatedScore: 0, from: [], to: ['B'] }
    ])

    test([
      ["A", "B", 1],
      ["A", "C", 1],
      ["C", "B", 1],
    ], [
      {
        key: 'B',
        score: 1,
        accumulatedScore: 1,
        from: ['C', 'A'],
        to: []
      },
      {
        key: 'C',
        score: 0.5,
        accumulatedScore: 0.333,
        from: ['A'],
        to: ['B']
      },
      {
        key: 'A',
        score: 0,
        accumulatedScore: 0,
        from: [],
        to: ['B', 'C']
      }
    ])

  });
  // */

  /* */
  it("should be able to generate score graph from cyclic references", async () => {
    test([
      ["A", "B", 1],
      ["B", "A", 1],
    ], [
      {
        key: 'A',
        score: 1,
        accumulatedScore: 1,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'B',
        score: 1,
        accumulatedScore: 0.667,
        from: ['A'],
        to: ['A']
      }
    ])

    test([
      ["A", "B", 1],
      ["B", "A", 1],
      ["C", "B", 1],
      ["B", "C", 1],
    ], [
      {
        key: 'B',
        score: 1,
        accumulatedScore: 1,
        from: ['A', 'C'],
        to: ['A', 'C']
      },
      {
        key: 'A',
        score: 0.5,
        accumulatedScore: 0.75,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'C',
        score: 0.5,
        accumulatedScore: 0.75,
        from: ['B'],
        to: ['B']
      }
    ])
    test([
      ["A", "B", 1],
      ["B", "A", 1],
      ["C", "B", 1],
      ["B", "C", 1],
      ["B", "D", 1],
    ], [
      {
        key: 'B',
        score: 1,
        accumulatedScore: 1,
        from: ['A', 'C'],
        to: ['A', 'C', 'D']
      },
      {
        key: 'A',
        score: 0.5,
        accumulatedScore: 0.583,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'C',
        score: 0.5,
        accumulatedScore: 0.583,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'D',
        score: 0.5,
        accumulatedScore: 0.583,
        from: ['B'],
        to: []
      }
    ])

    test([
      ["A", "B", 1],
      ["B", "A", 1],
      ["C", "B", 1],
      ["B", "C", 1],
      ["D", "B", 1],
    ], [
      {
        key: 'B',
        score: 1,
        accumulatedScore: 1,
        from: ['A', 'C', 'D'],
        to: ['A', 'C']
      },
      {
        key: 'A',
        score: 0.333,
        accumulatedScore: 0.7,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'C',
        score: 0.333,
        accumulatedScore: 0.7,
        from: ['B'],
        to: ['B']
      },
      { key: 'D', score: 0, accumulatedScore: 0, from: [], to: ['B'] }
    ])

    test([
      ["A", "B", 1],
      ["B", "A", 1],
      ["C", "B", 1],
      ["B", "C", 1],
      ["D", "B", 1],
      ["B", "D", 1],
    ], [
      {
        key: 'B',
        score: 1,
        accumulatedScore: 1,
        from: ['A', 'C', 'D'],
        to: ['A', 'C', 'D']
      },
      {
        key: 'A',
        score: 0.333,
        accumulatedScore: 0.5,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'C',
        score: 0.333,
        accumulatedScore: 0.5,
        from: ['B'],
        to: ['B']
      },
      {
        key: 'D',
        score: 0.333,
        accumulatedScore: 0.5,
        from: ['B'],
        to: ['B']
      }
    ])
  });
  // */


});


interface TestGroup extends TGroup { key: string };

function test(
  list:
    [
      from: string,
      to: string,
      value: number,
    ][],
  expected: {
    key: string;
    score: number;
    accumulatedScore: number;
    from: string[];
    to: string[];
  }[],
) {
  const graph = buildAffinityGroups(list, (key: string): TestGroup => {
    return {
      key,
      score: 0,
      accumulatedScore: 0,
      from: [],
      to: [],
    };
  });
  try {
    expect(graph.map(transform)).toEqual(expected);
  } catch (e) {
    console.log("graph", graph.map(transform));
    throw e;
  }
}

function transform<T>(data: TestGroup) {
  return {
    key: data.key,
    score: +data.score.toFixed(3),
    accumulatedScore: +data.accumulatedScore.toFixed(3),
    from: data.from.map((d) => d.key),
    to: data.to.map((d) => d.key),
  };
}
