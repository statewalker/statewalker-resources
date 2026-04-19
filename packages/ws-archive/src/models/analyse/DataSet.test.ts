import * as aq from "arquero";
import { describe, expect, it } from "vitest";
import { DataSet } from "./DataSet.js";

describe("DataSet", () => {
  it("should be able to intitialize and search...", async () => {
    const data = generateTestObjects(100);
    const len = data.numRows();
    const dataSet = new DataSet(data, { withRowId: true, searchDelay: 1 });
    expect(dataSet.table.numRows()).toBe(len);
    expect(dataSet.searchResults.numRows()).toBe(len);
    expect(dataSet.size).toBe(len);
    expect(dataSet.fullSize).toBe(len);

    expect(dataSet.filter.count()).toBe(100);
    dataSet.search("Object99");
    await delay(10);
    expect(dataSet.filter.count()).toBe(1);
    expect(dataSet.size).toBe(1);
    expect(dataSet.fullSize).toBe(len);
    expect(dataSet.table.numRows()).toBe(len);
    expect(dataSet.searchResults.numRows()).toBe(1);
  });
});

async function delay(ms = 0) {
  await new Promise((r) => setTimeout(r, ms));
}

function generateTestObjects(count: number): aq.ColumnTable {
  const id: number[] = [];
  const name: string[] = [];
  const value: number[] = [];

  for (let i = 0; i < count; i++) {
    id.push(i);
    name.push(`Object${i}`);
    value.push(Math.random());
  }
  return aq.table({
    id,
    name,
    value,
  });
}
