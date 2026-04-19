import { utf8 } from "@uwdata/flechette";
import * as aq from "arquero";
import { Base } from "../../lib/Base.js";

import type { DataType } from "@uwdata/flechette";
import { newDebounced } from "../../lib/agen/debounce.js";
import { getTableFieldsProvider } from "./search/getTableFieldsProvider.js";
import { type TableSearch, defaultSearchProvider } from "./search/index.js";
import { equalMasks } from "./tools/compareBitMask.js";
import { inferType } from "./tools/infer-type.js";

const incCounter = (() => {
  let counter = 0;
  return () => counter++;
})();
export class BaseDataSet extends Base {
  static newTable() {
    return BaseDataSet.withRowId();
  }

  static withRowId(table?: aq.Table): aq.ColumnTable {
    const columnTable = aq.table(table || []);
    const columns = new Set(columnTable.columnNames());
    if (columns.has("rowid")) {
      return columnTable;
    }
    return columnTable.derive({ rowid: (d) => aq.op.row_number() - 1 });
  }

  constructor(
    data?: aq.Table | ArrayBuffer,
    { withRowId = false }: { withRowId?: boolean } = {},
  ) {
    super();
    this.checkRowId = withRowId;
    this._initTable(data);
    this._initFilters();
  }

  // ---------------------------------------------------------------------

  get fullSize(): number {
    return this.table.numRows();
  }

  get size(): number {
    return this.filteredTable.numRows();
  }

  // ---------------------------------------------------------------------
  // Init table

  _initTable(data?: aq.Table | ArrayBuffer) {
    this._defineProperties("_table", "_tableUpdateCounter");
    this.table = data || aq.table([]);
  }

  protected FULL_MASK: aq.BitSet = null!;

  protected _tableUpdateCounter = incCounter();
  protected _table: aq.ColumnTable = null!;
  protected _tableColumnsTypes: undefined | Record<string, DataType>;

  get tableColumns() {
    return this.table.columnNames();
  }
  get tableColumnsTypes(): Record<string, DataType> {
    if (this._tableColumnsTypes === undefined) {
      this._tableColumnsTypes = {};
      for (const column of this.tableColumns) {
        const getter = this.table.getter(column);
        const type = inferType((cb) => {
          for (let i = 0, len = this.table.numRows(); i < len; i++) {
            cb(getter(i));
          }
        }, utf8);
        this._tableColumnsTypes[column] = type;
      }
    }
    return this._tableColumnsTypes;
  }

  protected checkRowId: boolean;

  observeTable = this.getObserver(() => this.table);
  get table(): aq.ColumnTable {
    return this._table;
  }
  set table(data: aq.Table | ArrayBuffer) {
    let table: aq.ColumnTable;
    if (data instanceof aq.Table) {
      table = aq.table(data.reify());
    } else {
      table = aq.fromArrow(data, { useDate: true });
    }
    if (this.checkRowId) {
      table = (
        this.constructor as unknown as {
          withRowId: (table?: aq.Table) => aq.ColumnTable;
        }
      ).withRowId(table);
    }
    this._setTable(table);
  }
  protected _setTable(table: aq.ColumnTable) {
    this._table = table;
    this._tableColumnsTypes = undefined;
    this.FULL_MASK = this.newFilterMask(true);
    this._tableUpdateCounter = incCounter();
    // Reload filtered table columns. Keep only existing columns.
    const tableColumns = [...this.filteredTableColumns];
    this.filteredTableColumns = tableColumns.length
      ? tableColumns
      : this.tableColumns;
    this.resetMainFilter();
  }
  // ---------------------------------------------------------------------
  // Init table filtering

  _initFilters() {
    this._defineProperties(
      "_filter",
      "_filtersIndex",
      "_filteredTable",
      "_tableUpdateCounter",
    );
  }

  protected _filtersIndex: Record<string, aq.BitSet> = {};

  protected _filter: aq.BitSet | undefined;

  protected _filterUpdateCounter = incCounter();

  protected _filteredTable: aq.ColumnTable = this._table;

  get filter(): aq.BitSet {
    return this._filter ?? this.FULL_MASK;
  }

  protected resetMainFilter() {
    this._updateMainFilter({}, true);
  }

  protected _updateMainFilter(
    filters: Record<string, aq.BitSet>,
    reset = false,
  ) {
    // Update filters index
    this._filtersIndex = {
      ...(reset ? {} : this._filtersIndex),
      ...filters,
    };

    // Combine all filters
    const filter = this.newFilterMask(true);
    for (const f of Object.values(this._filtersIndex)) {
      filter.and(f);
    }

    const tableUpdated = this._tableUpdateCounter > this._filterUpdateCounter;
    const filterUpdated = !equalMasks(this._filter, filter);
    if (tableUpdated || filterUpdated) {
      this._filter = filter;
      this._filterUpdateCounter = incCounter();
      this._filteredTable = this._createFilteredTable(filter);
    }
    return this._filter ?? this.FULL_MASK;
  }

  protected _createFilteredTable(filter: aq.BitSet): aq.ColumnTable {
    return this.table
      .select(this._filterColumns(this.filteredTableColumns))
      .create({ filter });
  }

  observeFilteredTable = this.getObserver(() => this.filteredTable);
  get filteredTable(): aq.ColumnTable {
    return this._filteredTable;
  }

  _filteredTableColumns: undefined | string[];
  _filterColumns(columns: string[]): string[] {
    const tableColumns = new Set(this.table.columnNames());
    const filteredTableColumns = columns.filter((c) => tableColumns.has(c));
    return [...filteredTableColumns];
  }
  get filteredTableColumns() {
    return this._filteredTableColumns || this.table.columnNames();
  }
  set filteredTableColumns(fields: string[]) {
    this._filteredTableColumns = this._filterColumns(fields);
    this._tableUpdateCounter = incCounter();
    this._updateMainFilter({}, false);
  }
  setFilteredTableColumns(columns: string[]) {
    this.filteredTableColumns = columns;
  }
  get filteredTableColumnsTypes() {
    const columnsTypes = this.tableColumnsTypes;
    const filteredTableColumnsTypes = {} as Record<string, DataType>;
    for (const column of this.filteredTableColumns) {
      filteredTableColumnsTypes[column] = columnsTypes[column];
    }
    return filteredTableColumnsTypes;
  }

  // ---------------------------------------------------------------------
  // Creates and returns an empty bitset with the same size as the table
  newFilterMask(fill?: boolean): aq.BitSet {
    const mask = new aq.BitSet(this.table.numRows());
    if (fill) {
      mask.not();
    }
    return mask;
  }

  // ---------------------------------------------------------------------

  /**
   * Updates records in the table using the provided records. This method replaces
   * the values from the records in the table. The records must contain a `rowid` property
   * that indicates the row to update. If the `rowid` is out of bounds (less than zero or
   * greater than or equal to the number of rows in the table, or not a number),
   * the record will be ignored. The method will only update the columns that are present
   * in the records. If a column is not present in the records, it will not be updated.
   * All extra columns in the records will be ignored.
   * This method creates a new table with the updated values and assigns it to the current table.
   *
   * @param records a list of records to update
   * @param records.rowid the rowid of the record to update
   * @returns
   */
  updateRecords(
    records: Record<string, unknown>[],
    ignoreFieldsCase = true,
  ): {
    updatedRows: number;
    updatedFields: number;
  } {
    const stats = {
      updatedRows: 0,
      updatedFields: 0,
    };
    const table = this.table.reify();
    const firstRecord = records[0];
    if (firstRecord === undefined) {
      return stats;
    }

    const columnsToUpdateIndex: Record<string, unknown[]> = {};
    const columnsIndex: Record<string, unknown[]> = {};

    const getFieldKey = (fieldName: string) =>
      ignoreFieldsCase ? fieldName.toLowerCase() : fieldName;
    const columnsNamesMapping: Record<string, string> = Object.keys(
      firstRecord,
    ).reduce(
      (mapping, columnName) => {
        mapping[getFieldKey(columnName)] = columnName;
        return mapping;
      },
      {} as Record<string, string>,
    );

    const allColumnsNames = table.columnNames();
    for (const columnName of allColumnsNames) {
      let column = table.column(columnName) as unknown[];
      if (columnName !== "rowid") {
        const columnKey = getFieldKey(columnName);
        const recordFieldName = columnsNamesMapping[columnKey];
        if (recordFieldName) {
          column = [...column];
          columnsToUpdateIndex[recordFieldName] = column;
        }
      }
      columnsIndex[columnName] = column;
    }
    const columnsToUpdate = Object.entries(columnsToUpdateIndex);

    const tableLength = table.numRows();
    for (const record of records) {
      const rowid = Number.parseInt(String(record.rowid));
      if (Number.isNaN(rowid) || rowid < 0 || rowid >= tableLength) {
        continue;
      }
      for (const [columnName, column] of columnsToUpdate) {
        const value = record[columnName];
        column[rowid] = value;
        stats.updatedFields++;
      }
      stats.updatedRows++;
    }
    if (stats.updatedFields > 0) {
      const filtersIndex = this._filtersIndex;
      const newTable = aq.table(columnsIndex);
      this.table = this.table.assign(newTable);
      this._updateMainFilter(filtersIndex);
    }
    return stats;
  }

  // ---------------------------------------------------------------------

  observeCsv = this.getObserver(() => this.toCsv());
  toCsv() {
    return aq.toCSV(this.filteredTable);
  }

  toFullCsv() {
    return aq.toCSV(this.table);
  }
}

export type DataSetOptions = {
  withRowId?: boolean;
  searchDelay?: number;
  searchFields?: string[];
} & Record<string, unknown>;
export class DataSet extends BaseDataSet {
  constructor(
    data?: aq.Table | ArrayBuffer,
    { searchFields, searchDelay, ...options }: DataSetOptions = {},
  ) {
    super(data, options);
    this._initQuerySearch({ searchFields, searchDelay });
  }

  // ---------------------------------------------------------------------

  get visibilityFilter(): aq.BitSet {
    return this._filtersIndex.visibilityFilter || this.FULL_MASK;
  }

  set visibilityFilter(visibilityFilter: aq.BitSet) {
    this._updateMainFilter({
      visibilityFilter: visibilityFilter ?? this.FULL_MASK,
    });
  }

  // ---------------------------------------------------------------------

  async _newSearchRunner(
    table: aq.ColumnTable,
    searchFields: string[],
  ): Promise<TableSearch> {
    const fieldsProviders = getTableFieldsProvider({
      table,
      fields: searchFields,
    });
    const rows = new aq.BitSet(table.numRows());
    rows.not();
    return await defaultSearchProvider({
      rows,
      fieldsProviders,
    });
  }

  // ---------------------------------------------------------------------
  // Init query search

  searchFields: string[] = [];

  _searchRunner?: TableSearch;

  searchDelay = 50;
  _initQuerySearch({
    searchFields,
    searchDelay,
  }: { searchDelay?: number; searchFields?: string[] } = {}) {
    this._defineProperties("query", "searchFields");
    this.searchDelay = searchDelay || this.searchDelay;
    this.searchFields = searchFields || [];
    let previousSearchFields: string[] = null!;
    let previousTableUpdateCounter = -1;

    const runSearch = async ({
      query,
      table,
      searchFields,
      _tableUpdateCounter,
    }: {
      query: string;
      table: aq.ColumnTable;
      searchFields: string[];
      _tableUpdateCounter: number;
    }) => {
      let reset = false;
      if (
        _tableUpdateCounter !== previousTableUpdateCounter ||
        searchFields !== previousSearchFields
      ) {
        // Reset search provider if the table was changed
        previousSearchFields = searchFields;
        previousTableUpdateCounter = _tableUpdateCounter;
        reset = true;
      }

      if (!this._searchRunner || reset) {
        this._searchRunner = await this._newSearchRunner(table, searchFields);
      }
      const searchFilter = await this._searchRunner({ query });
      this.searchFilter = searchFilter;
    };

    const runSearchDebounced = newDebounced(this.searchDelay, runSearch);
    this.autorun(() => {
      const { query, table, _tableUpdateCounter, searchFields } = this;
      // return async () => runSearch({ query, table, searchFields });
      return async () =>
        runSearchDebounced({ query, table, _tableUpdateCounter, searchFields });
    });
  }

  get searchFilter() {
    return this._filtersIndex.searchFilter || this.FULL_MASK;
  }

  set searchFilter(searchFilter: aq.BitSet) {
    this._updateMainFilter({
      searchFilter: searchFilter ?? this.FULL_MASK,
    });
  }

  // // _searchRunner?: TableSearch;
  // _searchProvider: TableSearchProvider = defaultSearchProvider;
  // setSearchProvider(provider: TableSearchProvider) {
  //   // this._searchRunner = undefined;
  //   this._searchProvider = provider;
  //   return this;
  // }

  protected query = "";
  observeQuery = this.getObserver(() => this.query);

  observeSearchResults = this.observeFilteredTable;

  search(query: string) {
    this.query = query;
  }
  get searchResults(): aq.ColumnTable {
    return this.filteredTable;
  }
}
