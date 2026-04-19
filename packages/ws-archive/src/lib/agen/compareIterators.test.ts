import { describe, expect, it } from "vitest";
import { compareIterators } from "./compareIterators.js";

describe("compareIterators", () => {
  it("should be able to compare two ordered sequances", () => {
    const removed = [] as string[];
    const added = [] as string[];
    const updated = [] as string[];
    const first = ["A", "B", "C", "D"];
    const second = ["0", "B", "D", "E"];

    const result = compareIterators({
      getFirst: (i) => first[i],
      getSecond: (j) => second[j],
      firstLen: first.length,
      secondLen: second.length,
      onAdd: (val) => { added.push(val); },
      onRemove: (val) => { removed.push(val); },
      onUpdate: (val) => { updated.push(val); },
    })
    expect(added).toEqual(["0", "E"]);
    expect(removed).toEqual(["A", "C"]);
    expect(updated).toEqual(["B", "D"]);
    expect(result).toEqual([2, 2, 2])
  });

  it("should be able to compare two ordered sequances with custom compare function", () => {
    const firstList = ["A", "B", "C", "D"];
    const secondList = ["B", "D", "E", "F"];
    const output: string[] = [];
    const [added, updated, removed] = compareIterators({
      getFirst: (i) => firstList[i],
      getSecond: (j) => secondList[j],
      firstLen: firstList.length,
      secondLen: secondList.length,
      compare: (a, b) => a.localeCompare(b),
      onAdd: (item) => output.push(`Added: ${item}`),
      onRemove: (item) => output.push(`Removed: ${item}`),
      onUpdate: (first, second) => output.push(`Updated: ${first} -> ${second}`),
    });
    output.push(`Resume: [Added: ${added}, Updated: ${updated}, Removed: ${removed}]`);
    // Output:
    expect(output).toEqual([
      "Removed: A",
      "Updated: B -> B",
      "Removed: C",
      "Updated: D -> D",
      "Added: E",
      "Added: F",
      "Resume: [Added: 2, Updated: 2, Removed: 2]"
    ]);
  });
});
