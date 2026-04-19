import * as aq from "arquero";
import { DataSet } from "./DataSet.js";

function toArray<T>(value?: T | T[]): T[] {
  return Array.isArray(value) ? value : value !== undefined ? [value] : [];
}

export type TreeNode = {
  id: number;
  children?: TreeNode[];
};
export class TreeDataSet extends DataSet {
  #getParents: (rowId: number, navigator: TreeDataSet) => number[];
  protected _baseTable: aq.ColumnTable = null!;
  get baseTable(): aq.ColumnTable {
    return this._baseTable;
  }
  get fullSize() {
    return this._baseTable.numRows();
  }

  set baseTable(data: aq.Table | ArrayBuffer) {
    this._baseTable = aq.table(data);
    const len = this._baseTable.numRows();
    this._parentsIdsIndex = new Array<number[]>(len);
    this._childrenIdsIndex = new Array<number[]>(len);
    for (let childId = 0; childId < len; childId++) {
      const parentsIds = this.#getParents(childId, this);
      this._parentsIdsIndex[childId] = parentsIds;
      for (const parentId of parentsIds) {
        const children =
          this._childrenIdsIndex[parentId] ||
          (this._childrenIdsIndex[parentId] = []);
        children.push(childId);
      }
    }
    const empty: number[] = [];
    for (let i = 0; i < len; i++) {
      this._parentsIdsIndex[i] = this._parentsIdsIndex[i] ?? empty;
      this._childrenIdsIndex[i] = this._childrenIdsIndex[i] ?? empty;
    }
    for (let i = 0; i < len; i++) {
      this._parentsIdsIndex[i].sort((a, b) => {
        return b - a;
      });
    }
    this.selectId(this.selectedId);
  }
  #transform: ({
    mask,
    table,
    tree,
  }: {
    mask: aq.BitSet;
    table: aq.ColumnTable;
    tree: TreeDataSet;
  }) => aq.ColumnTable;

  constructor(
    baseTable: aq.ColumnTable,
    {
      parentsIdColumn = "parent",
      getParents = (rowId: number, navigator: TreeDataSet) => {
        const ids = navigator.baseTable.get(parentsIdColumn, rowId);
        return toArray(ids);
      },
      rootId = 0,
      selectedId = rootId,
      delay,
      transform = ({
        mask,
        table,
        tree,
      }: {
        mask: aq.BitSet;
        table: aq.ColumnTable;
        tree: TreeDataSet;
      }) => {
        const resultingTable = table.create({ filter: mask });
        return resultingTable;
      },
      ...options
    }: {
      parentsIdColumn?: string;
      getParents?: (rowId: number, navigator: TreeDataSet) => number[];
      transform?: (params: {
        mask: aq.BitSet;
        table: aq.ColumnTable;
        tree: TreeDataSet;
      }) => aq.ColumnTable;
      selectedId?: number;
      rootId?: number;
      delay?: number;
    },
  ) {
    super(aq.table([]), { ...options, delay, searchDelay: delay });
    this.rootId = rootId;
    this.#getParents = getParents;
    this.#transform = transform;
    this.baseTable = baseTable;
    this.initNavigation(delay);
    this.selectedId = selectedId;
  }

  initNavigation(delay = 10) {
    this.#updateSelectedId(this.selectedId);
    this._defineProperties("_selectedId", "_parents");
  }

  rootId = 0;

  protected _selectedId = 0;
  observeSelectedId = this.getObserver(() => this.selectedId);
  get selectedId() {
    return this._selectedId;
  }
  set selectedId(value: number) {
    this.#updateSelectedId(value);
  }
  selectId(value: number) {
    if (!(value >= 0 && value < this._baseTable.numRows())) {
      return false;
    }
    this.selectedId = value;
    return true;
  }
  selectParent() {
    const parentId = this.parentId;
    if (parentId === undefined) {
      return false;
    }
    this.selectedId = parentId;
    return true;
  }
  hasChildren(rowId: number): boolean {
    return this._childrenIdsIndex[rowId]?.length > 0;
  }
  getPath(rowId: number): number[] {
    const path = new Set<number>();
    path.add(rowId);
    for (let id: number | undefined = rowId; id !== undefined;) {
      const parents: number[] = this._parentsIdsIndex[id];
      if (!parents || !parents?.length) {
        break;
      }
      id = parents.find((parentId) => !path.has(parentId));
      if (id !== undefined) {
        path.add(id);
      }
    }
    return [...path].reverse();
  }

  protected _parentsIdsIndex: number[][] = [];
  protected _childrenIdsIndex: number[][] = [];

  get parentId(): number | undefined {
    return (this._parentsIdsIndex[this.selectedId] ?? [])[0] ?? -1;
  }
  getParentsTree(nodeId: number): TreeNode {
    const index: Record<number, TreeNode> = {};
    let root: TreeNode | undefined;
    const visit = (id: number) => {
      let node = index[id];
      if (!node) {
        node = index[id] = { id };
        const parentsIds = this.getParentsIds(id);
        if (parentsIds.length === 0) {
          root = node;
        }
        for (const parentId of parentsIds) {
          const parent = visit(parentId);
          const children = (parent.children = parent.children ?? []);
          if (children.indexOf(node) < 0) {
            parent.children.push(node);
          }
        }
      }
      return node;
    };
    const node = visit(nodeId);
    return root ?? node;
  }
  getParentsIds(id: number): number[] {
    return this._parentsIdsIndex[id] ?? [];
  }
  getChildrenIds(id: number): number[] {
    return this._childrenIdsIndex[id] ?? [];
  }

  protected _parents: aq.ColumnTable = null!;
  observeParentsTable = this.getObserver(() => this.parents);
  get parents() {
    return this._parents;
  }
  #updateSelectedId(selectedId = 0) {
    // Reload children
    const newBitMask = () => {
      const mask = new aq.BitSet(this._baseTable.numRows());
      return mask;
    };

    // Reload parents all tables
    this._selectedId = selectedId;

    const parentsBitMask = newBitMask();
    const childrenBitMask = newBitMask();
    parentsBitMask.set(selectedId);
    for (const id of this.getChildrenIds(selectedId)) {
      // const parentsIds = this.getParentsIds(id);
      // for (const parentId of parentsIds) {
      //   parentsBitMask.set(parentId);
      // }
      childrenBitMask.set(id);
    }

    this._parents = this.transformBaseTable(parentsBitMask);
    this.table = this.transformBaseTable(childrenBitMask);
  }

  protected transformBaseTable(mask: aq.BitSet): aq.ColumnTable {
    return this.#transform({
      table: this._baseTable,
      mask,
      tree: this,
    });
  }
}
