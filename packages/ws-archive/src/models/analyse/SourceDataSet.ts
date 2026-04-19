import * as aq from "arquero";
import { newDebounced } from "../../lib/agen/debounce.js";
import { DataSet, type DataSetOptions } from "./DataSet.js";


export type SourceDataSetOptions = DataSetOptions & {
  name?: string;
};
export class SourceDataSet extends DataSet {
  dataSetName: string;

  constructor(
    data?: aq.Table | ArrayBuffer,
    { name, searchDelay, searchFields, ...options }: SourceDataSetOptions = {},
  ) {
    super(data, { withRowId: true, ...options });
    this.dataSetName = name ?? `${this.constructor.name}-${Date.now()}`;
    this._initGlobalFilters();
    this._initSelection();
  }

  protected _setTable(table: aq.ColumnTable) {
    let tbl = table;
    const columnNames = table.columnNames();
    if (columnNames.indexOf("status") === -1) {
      tbl = table.derive({ status: () => "" });
    }
    super._setTable(tbl);
  }


  // ---------------------------------------------------------------------
  // Init global filters


  /**
   * Global filters are used to filter out values from the table based on the values of the columns.
   * The filter values are JS expressions returning a boolean value for all rows to keep in the table.
   * Note that the current filtered row is defined as `this` in the expression.
   */
  globalFilters: { [key: string]: boolean } = {};

  globalFilterMask: aq.BitSet = this.FULL_MASK;
  get globallyFilteredItems() {
    return this.globalFilterMask.length - this.globalFilterMask.count();
  }
  observeGlobalFilterMask = this.getObserver(() => this.globalFilterMask);

  observeGlobalFilters = this.getObserver(() => this.globalFilters);

  _initGlobalFilters() {
    this._defineProperties("globalFilters", "globalFilterMask");

    const runFiltering = async ({
      globalFilters,
      table,
    }: {
      globalFilters: { [key: string]: boolean };
      table: aq.ColumnTable;
    }) => {
      let mask = this.FULL_MASK;
      const querySegments: string[] = Object.entries(globalFilters)
        .map(([query, active]) => {
          if (!active) {
            return "";
          }
          query = query.trim();
          if (query[0] === "?" || query[0] === ":") {
            query = query.slice(1);
          }
          return (query.length > 0)
            ? `(${query})`
            : "";
        }).filter(Boolean);
      if (querySegments.length > 0) {
        const searchFields = table.columnNames();
        const runner = await this._newSearchRunner(table, searchFields);
        const query = `:${querySegments.join(" && ")}`;
        mask = await runner({ query }) ?? this.FULL_MASK;
      }
      this.globalFilterMask = mask;
      this._updateMainFilter({
        globalFilter: mask,
      });
    }
    const runDebouncedFiltering = newDebounced(this.searchDelay, runFiltering);
    this.autorun(() => {
      const { table, globalFilters } = this;
      return runDebouncedFiltering({ table, globalFilters });
    });

    this.globalFilters = {
      'this.status !== "OK" && this.status !== "KO"': true,
      'this.status === "OK"': false,
      'this.status === "KO"': false,
    };
  }

  // ---------------------------------------------------------------------

  protected _selectionMaskWrapper: { mask: aq.BitSet } = null!;
  #updateSelectionMask(mask: aq.BitSet) {
    this._selectionMaskWrapper = { mask };
    // this._updateMainFilter({ selection: mask });
  }

  protected _initSelection() {
    this._selectionMaskWrapper = {
      mask: this.newFilterMask(),
    };
    this._defineProperties("_selectionMaskWrapper");
  }

  observeSelectionMask = this.getObserver(() => this.selectionMask);
  get selectionMask(): aq.BitSet {
    return this._selectionMaskWrapper.mask;
  }
  hasSelection(): boolean {
    return this.selectionMask.count() > 0;
  }
  isSelected(row: number): boolean {
    return !!this.selectionMask.get(row);
  }

  replaceFields(
    fieldsValues: Record<string, unknown>,
    selectionMask: aq.BitSet = this.selectionMask,
  ) {

    const table = this.table.reify();
    const columnsNames = Object.keys(fieldsValues);
    const getters = columnsNames.map((columnName) => table.getter(columnName));
    const length = table.numRows();
    const columns: Record<string, unknown[]> = {};
    const filter = this.filter;
    const isVisible =
      filter.count() > 0 ? (row: number) => !!filter.get(row) : () => true;
    const isSelected =
      selectionMask.count() > 0
        ? (row: number) => !!selectionMask.get(row)
        : () => true;
    columnsNames.forEach((columnName, idx) => {
      const getter = getters[idx];
      columns[columnName] = Array.from({ length }, (_, row) => {
        let value = getter(row);
        if (isVisible(row) && isSelected(row)) {
          value = fieldsValues[columnName];
        }
        return value;
      });
    });
    const newTable = aq.table(columns);
    this.table = this.table.assign(newTable);
  }

  setSelection(rows: number | number[], select: boolean) {
    const { mask } = this._selectionMaskWrapper;
    const allRows = Array.isArray(rows) ? rows : [rows];
    let updated = false;
    for (const row of allRows) {
      if (!!mask.get(row) === select) {
        continue; // No changes
      }
      if (select) {
        mask.set(row);
      } else {
        mask.clear(row);
      }
      updated = true;
    }
    // Trigger the change
    if (updated) {
      this.#updateSelectionMask(mask);
    }
  }
  // toggleSelection(row: number) {
  //   this.setSelection(row, !this.isSelected(row));
  // }
  // ---------------------
  // All selection
  // clearAllFilteredSelection() {
  //   const filteredOutRows = this.newFilterMask(true).and(this.filter);
  //   const mask = this.selectionMask.and(filteredOutRows);
  //   this.#updateSelectionMask(mask);
  // }
  // toggleAllFilteredSelection() {
  //   if (this.getSelectionDegree() === 0) {
  //     this.selectAllFiltered();
  //   } else {
  //     this.clearAllFilteredSelection();
  //   }
  // }
  // getFilteredSelectionDegree() {
  //   const selectedRows = this.selectionMask;
  //   const visibleSelection = this.newFilterMask(true)
  //     .and(this.filter)
  //     .and(selectedRows);
  //   const total = selectedRows.count();
  //   const selected = visibleSelection.count();
  //   return total === 0 ? 0 : selected / total;
  // }
  // selectAllFiltered() {
  //   const mask = this.newFilterMask(true).and(this.filter);
  //   this.#updateSelectionMask(mask);
  // }
  // ---------------------
  // All selection
  #newSelectionMask(filtered = true): aq.BitSet {
    const mask = this.newFilterMask(true);
    if (filtered) {
      const filter = this.filter;
      if (filter.count() > 0) {
        mask.and(filter);
      }
    }
    return mask;
  }
  toggleAllSelection(filtered = true) {
    const len = this.getSelectionDegree();
    if (len === 0) {
      this.selectAll(filtered);
    } else {
      this.clearAllSelection();
    }
  }
  selectAll(filtered = true) {
    const mask = this.#newSelectionMask(filtered);
    this.#updateSelectionMask(mask);
  }
  invertSelection(filtered = true) {
    const mask = this.#newSelectionMask(filtered);
    mask.and(this.selectionMask);
    mask.not();
    this.#updateSelectionMask(mask);
  }
  clearAllSelection() {
    const mask = this.newFilterMask(false);
    this.#updateSelectionMask(mask);
  }
  getSelectionDegree() {
    const total = this.size;
    const selected = this.selectionMask.count();
    if (total === 0) {
      return 0;
    }
    return selected / total;
  }
}
