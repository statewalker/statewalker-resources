import * as aq from "arquero";
import { describe, expect, it } from "vitest";
import { TreeDataSet } from "./TreeDataSet.js";

describe("TreeDataSet", () => {
  it("should be able to manage selections and provide access to parents/children", async () => {
    const data = [
      { id: 0, parent: undefined, name: "Object0" },
      { id: 1, parent: 0, name: "Object1" },
      { id: 2, parent: 0, name: "Object2" },
      { id: 3, parent: 1, name: "Object3" },
      { id: 4, parent: 1, name: "Object4" },
      { id: 5, parent: 2, name: "Object5" },
      { id: 6, parent: 2, name: "Object6" },
      { id: 7, parent: 3, name: "Object7" },
      { id: 8, parent: 3, name: "Object8" },
      { id: 9, parent: 4, name: "Object9" },
    ].reduce(
      (acc, d) => {
        acc.id.push(d.id);
        acc.parent.push(d.parent);
        acc.name.push(d.name);
        return acc;
      },
      { id: [], parent: [], name: [] } as {
        id: number[];
        parent: (number | undefined)[];
        name: string[];
      },
    );

    const tree = new TreeDataSet(aq.table(data), {
      parentsIdColumn: "parent",
    });
    // The initially selected object is the root with the id = 0
    expect(tree.selectedId).toBe(0);
    expect(tree.table.numRows()).toBe(2);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([
      { id: 1, parent: 0, name: "Object1" },
      { id: 2, parent: 0, name: "Object2" },
    ]);
    expect(tree.parents.objects()).toEqual([
      { id: 0, parent: undefined, name: "Object0" },
    ]);

    // Select a different object
    tree.selectedId = 2;
    expect(tree.selectedId).toBe(2);
    expect(tree.table.numRows()).toBe(2);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([
      { id: 5, parent: 2, name: "Object5" },
      { id: 6, parent: 2, name: "Object6" },
    ]);
    expect(tree.parents.objects()).toEqual([
      { id: 2, parent: 0, name: "Object2" },
    ]);

    // Select
    tree.selectedId = 8;
    expect(tree.selectedId).toBe(8);
    expect(tree.table.numRows()).toBe(0);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([]);
    expect(tree.parents.objects()).toEqual([
      { id: 8, parent: 3, name: "Object8" },
    ]);

    // Select back the parent object for 8
    // (The parent of 8 is 3)
    expect(tree.selectParent()).toBe(true);
    expect(tree.selectedId).toBe(3);
    expect(tree.table.numRows()).toBe(2);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([
      { id: 7, parent: 3, name: "Object7" },
      { id: 8, parent: 3, name: "Object8" },
    ]);
    expect(tree.parents.objects()).toEqual([
      { id: 3, parent: 1, name: "Object3" },
    ]);
  });

  it("should be able to transform basic objects", async () => {
    // Ids and other columns are generated automatically below during the transformation
    const data = [
      { parent: undefined }, // id = 0
      { parent: 0 }, // id = 1
      { parent: 0 }, // id = 2
      { parent: 1 }, // id = 3
      { parent: 1 }, // id = 4
      { parent: 2 }, // id = 5
      { parent: 2 }, // id = 6
      { parent: 3 }, // id = 7
      { parent: 3 }, // id = 8
      { parent: 4 }, // id = 9
    ].reduce(
      (acc, d, idx) => {
        acc.parent.push(d.parent);
        acc.rowid.push(idx);
        return acc;
      },
      { rowid: [], parent: [] } as {
        rowid: number[];
        parent: (number | undefined)[];
      },
    );

    const tree = new TreeDataSet(aq.table(data), {
      parentsIdColumn: "parent",
      transform: ({ mask, table }) => {
        return table
          .derive(
            {
              id: (d) => aq.op.row_number() - 1,
              parent: (d) => d.parent,
              name: (d) => `Object${aq.op.row_number() - 1}`,
            },
            { drop: true },
          )
          .create({ filter: mask });
      },
    });

    // The initially selected object is the root with the id = 0
    expect(tree.selectedId).toBe(0);
    expect(tree.table.numRows()).toBe(2);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([
      { id: 1, parent: 0, name: "Object1" },
      { id: 2, parent: 0, name: "Object2" },
    ]);
    expect(tree.parents.objects()).toEqual([
      { id: 0, parent: undefined, name: "Object0" },
    ]);

    // Select a different object
    tree.selectedId = 2;
    expect(tree.selectedId).toBe(2);
    expect(tree.table.numRows()).toBe(2);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([
      { id: 5, parent: 2, name: "Object5" },
      { id: 6, parent: 2, name: "Object6" },
    ]);
    expect(tree.parents.objects()).toEqual([
      { id: 2, parent: 0, name: "Object2" },
    ]);

    // Select
    tree.selectedId = 8;
    expect(tree.selectedId).toBe(8);
    expect(tree.table.numRows()).toBe(0);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([]);
    expect(tree.parents.objects()).toEqual([
      { id: 8, parent: 3, name: "Object8" },
    ]);

    // Select back the parent object for 8
    // (The parent of 8 is 3)
    expect(tree.selectParent()).toBe(true);
    expect(tree.selectedId).toBe(3);
    expect(tree.table.numRows()).toBe(2);
    expect(tree.parents.numRows()).toBe(1);
    expect(tree.table.objects()).toEqual([
      { id: 7, parent: 3, name: "Object7" },
      { id: 8, parent: 3, name: "Object8" },
    ]);
    expect(tree.parents.objects()).toEqual([
      { id: 3, parent: 1, name: "Object3" },
    ]);
  });

  it("should be able to search in transformed objects", async () => {
    // Ids and other columns are generated automatically below during the transformation
    const data = [
      { parent: undefined }, // id = 0
      { parent: 0 }, // id = 1
      { parent: 0 }, // id = 2
      { parent: 1 }, // id = 3
      { parent: 1 }, // id = 4
      { parent: 2 }, // id = 5
      { parent: 2 }, // id = 6
      { parent: 3 }, // id = 7
      { parent: 3 }, // id = 8
      { parent: 4 }, // id = 9
    ].reduce(
      (acc, d, idx) => {
        acc.parent.push(d.parent);
        acc.rowid.push(idx);
        return acc;
      },
      { rowid: [], parent: [] } as {
        rowid: number[];
        parent: (number | undefined)[];
      },
    );

    const tree = new TreeDataSet(aq.table(data), {
      delay: 1,
      parentsIdColumn: "parent",
      transform: ({ mask, table }) => {
        return table
          .derive(
            {
              id: (d) => aq.op.row_number() - 1,
              parent: (d) => d.parent,
              name: (d) => `Object${aq.op.row_number() - 1}`,
            },
            { drop: true },
          )
          .create({ filter: mask });
      },
    });
    tree.search("Object1");
    await new Promise((r) => setTimeout(r, 10));
    expect(tree.filteredTable.objects()).toEqual([
      { id: 1, parent: 0, name: "Object1" },
    ]);
  });
});
