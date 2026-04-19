import * as aq from "arquero";
import { splitDsv } from "../../lib/dsv/splitDsv.js";
import { getAdapter } from "../../lib/newAdapter.js";
import { FilesApiIOAdapter } from "./FilesApiIOAdapter.js";
import type { WorkspaceProject } from "./WorkspaceProject.js";

export type DataSetConfig = {
  key: string;
  name: string;
  path: string;
  fields?: string[];
  channels: {
    [channelName: string]: {
      fields: string[];
    };
  };
};
export type ChannelsConfig = {
  dataSets: [DataSetConfig, DataSetConfig];
};

/**
 * Adapter for the arrow tables loading in a workspace project.
 */
export class WorkspaceProjectDataAdapter {
  static get: (project: WorkspaceProject) => WorkspaceProjectDataAdapter;
  static remove: (project: WorkspaceProject) => void;
  static {
    [WorkspaceProjectDataAdapter.get, WorkspaceProjectDataAdapter.remove] =
      getAdapter<WorkspaceProjectDataAdapter, WorkspaceProject>(
        "adapter.workspace.project.data",
        (project: WorkspaceProject) => {
          return new WorkspaceProjectDataAdapter({ project });
        },
      );
  }
  // -------------------------------------------------------------------
  project: WorkspaceProject;

  get io() {
    return FilesApiIOAdapter.get(this.project);
  }
  constructor({ project }: { project: WorkspaceProject }) {
    this.project = project;
  }
  get configPath() {
    return "datamatch.config.json";
  }
  #config: ChannelsConfig | undefined;
  async getConfig(reload = false): Promise<ChannelsConfig> {
    if (reload || this.#config === undefined) {
      this.#config = await this.io.readJson<ChannelsConfig>(this.configPath);
    }
    return this.#config as ChannelsConfig;
  }

  async isProjectExists() {
    if (!(await this.hasFiles(this.configPath))) {
      return false;
    }
    return true;
  }

  async isValidDataMatchProject() {
    if (!(await this.isProjectExists())) {
      return false;
    }

    const config = await this.getConfig();
    if (!this.isValidConfig(config)) {
      return false;
    }
    const sourceFilesPaths = await this.getDataSourcePaths(false);
    if (!(await this.hasFiles(...sourceFilesPaths))) {
      console.log("No source files!", sourceFilesPaths);
      return false;
    }

    const dataFilesPaths = await this.getArrowTablesPaths(true);
    if (!(await this.hasFiles(...dataFilesPaths))) {
      console.log("No arrow files!", dataFilesPaths);
      return false;
    }

    return true;
  }

  isValidConfig(config: null | ChannelsConfig) {
    if (!config) {
      return false;
    }
    return config.dataSets?.length === 2;
  }

  protected async hasFiles(...paths: string[]) {
    const filesExists = await Promise.all(
      paths.map((path) => this.io.fileExists(path)),
    );
    const allFileExist = filesExists.reduce((acc, val) => acc && val, true);
    return allFileExist;
  }

  dataTables: [aq.ColumnTable, aq.ColumnTable] | undefined;

  async getDataSourcePaths(reload: boolean): Promise<[string, string]> {
    const config = await this.getConfig(reload);
    return [
      this.io.normalizePath(config.dataSets[0].path),
      this.io.normalizePath(config.dataSets[1].path),
    ];
  }

  async getArrowTablesPaths(
    reload: boolean,
    prefix = "",
    suffix = "",
  ): Promise<[string, string]> {
    const config = await this.getConfig(reload);
    const dataSetKeys = config.dataSets.map((ds) => ds.key);
    const prefixFixed = prefix ? `${prefix}.` : "";
    const suffixFixed = suffix ? `.${suffix}` : "";
    return [
      this.io.normalizePath(
        `_data/${prefixFixed}${dataSetKeys[0]}${suffixFixed}.arrow.gz`,
      ),
      this.io.normalizePath(
        `_data/${prefixFixed}${dataSetKeys[1]}${suffixFixed}.arrow.gz`,
      ),
    ];
  }

  async rebuildDataTables(reload = false) {
    const sourceFilesPaths = await this.getDataSourcePaths(reload);
    const dataTables = await Promise.all([
      this.loadCsvTable(sourceFilesPaths[0]),
      this.loadCsvTable(sourceFilesPaths[1]),
    ]);
    await this.storeDataTables(dataTables);
    return dataTables;
  }

  /**
   * Checks if a valid backup exists for the given prefix. 
   * This method checks that there is a version of the arrow tables older than the specified version,
   * that both arrow tables exist and they are have the same checksums.
   * @param prefix The prefix to check for backups.
   * @returns True if a valid backup exists, false otherwise.
   */
  async hasValidBackup(): Promise<boolean> {
    const historyPrefixes = await this.loadArrowTablesVersions();
    if (historyPrefixes.length === 0) {
      return false;
    }
    const latestVersion = historyPrefixes[0].version;
    const sourceTablesPaths = await this.getArrowTablesPaths(true);
    const targetTablesPaths = await this.getArrowTablesPaths(true, latestVersion);

    return (
      (await this.sameFileContent(sourceTablesPaths[0], targetTablesPaths[0])) &&
      (await this.sameFileContent(sourceTablesPaths[1], targetTablesPaths[1]))
    );
  }
  protected async sameFileContent(
    sourcePath: string,
    targetPath: string,
  ): Promise<boolean> {
    const sourceChecksum = await this.io.getSha1(sourcePath);
    const targetChecksum = await this.io.getSha1(targetPath);
    console.log(`Comparing checksums: ${sourcePath} : ${sourceChecksum}; ${targetPath} : ${targetChecksum}`);
    return sourceChecksum === targetChecksum;
  }

  newVersionPrefix(): string {
    const dateTime = new Date();
    const [timeStamp] = dateTime.toISOString().split(".");
    const [date] = timeStamp.split("T");
    const hours = `0${dateTime.getHours()}`.slice(-2);
    const minutes = `0${dateTime.getMinutes()}`.slice(-2);
    return `${date}.${hours}h${minutes}m`;
  }

  /**
   * Creates a backup copy of the current arrow tables and returns the version prefix used for the backup.
   * This method copies the current arrow tables to a new versioned path in the `_data/` directory.
   * If a version prefix is provided, it will be used as the prefix for the backup version.
   * If no version prefix is provided, a new version prefix will be generated based on the current date and time.
   * 
   * @param versionPrefix Optional prefix for the backup version. 
   * If not provided, a new version prefix will be generated based on the current date and time.
   * @returns The version prefix used for the backup.
   */
  async makeDataTablesBackup(versionPrefix?: string): Promise<string> {
    const prefix = versionPrefix ?? this.newVersionPrefix();
    const sourceTablesPaths = await this.getArrowTablesPaths(true);
    const targetTablesPaths = await this.getArrowTablesPaths(true, prefix);
    const makeCopy = async (source: string, target: string) => {
      const input = this.io.read(source);
      await this.io.write(target, input);
    };
    await Promise.all([
      makeCopy(sourceTablesPaths[0], targetTablesPaths[0]),
      makeCopy(sourceTablesPaths[1], targetTablesPaths[1]),
    ]);
    return prefix;
  }

  async removeDataTablesBackup(versionPrefix: string) {
    const arrowTablesPaths = await this.getArrowTablesPaths(true, versionPrefix);
    await Promise.all([
      this.io.remove(arrowTablesPaths[0]),
      this.io.remove(arrowTablesPaths[1]),
    ]);
  }

  async storeDataTables(dataTables: [aq.ColumnTable, aq.ColumnTable]) {
    const arrowTablesPaths = await this.getArrowTablesPaths(true);
    await Promise.all([
      this.storeArrowTable(arrowTablesPaths[0], dataTables[0], {}),
      this.storeArrowTable(arrowTablesPaths[1], dataTables[1], {}),
    ]);
    // return this.getDataTables(true);
  }

  async getDataTables(
    reload: boolean,
  ): Promise<[aq.ColumnTable, aq.ColumnTable]> {
    if (this.dataTables === undefined || reload) {
      this.dataTables = await this.loadDataTables("", reload);
    }
    return this.dataTables;
  }

  async loadDataTables(version: string, reload = true): Promise<[aq.ColumnTable, aq.ColumnTable]> {
    const arrowTablesPaths = await this.getArrowTablesPaths(reload, version);
    return await Promise.all([
      this.loadArrowTable(arrowTablesPaths[0]),
      this.loadArrowTable(arrowTablesPaths[1]),
    ]);
  }

  /**
   * Returns an ordered list of versions  
   */
  async loadArrowTablesVersions(): Promise<{ version: string }[]> {
    const dataDir = this.io.getFullPath("_data/");
    const index: Record<string, number> = {};
    for await (const file of this.io.filesApi.list(dataDir)) {
      const { path } = file;
      const versionPrefix = this.getVersionPrefix(path);
      if (versionPrefix) {
        index[versionPrefix] = (index[versionPrefix] ?? 0) + 1;
      }
    }
    return Object.entries(index).filter(([, count]) => count === 2).map(([version]) => ({ version }));
  }

  protected getVersionPrefix(path: string): string {
    const match = path.match(/^(.*\/)?([^\/]+)\.([^\/]+)?\.arrow\.gz$/);
    return match?.[2] ?? "";
  }


  withRowId(table: aq.ColumnTable) {
    return table.columnNames().indexOf("rowid") < 0
      ? table.derive({ rowid: () => aq.op.row_number() - 1 })
      : table;
  }

  /**
   * Stores the arrow table in the project.
   * @param path The path to store the arrow table.
   * @param table aq.ColumnTable instance
   * @param options Options for Arrow encoding.
   * @param options.columns: Ordered list of column names to include. If function-valued, the function should accept this table as a single argument and return an array of column name strings.
   * @param options.limit: The maximum number of rows to include (default Infinity).
   * @param options.offset: The row offset indicating how many initial rows to skip (default 0).
   * @param options.types: An optional object indicating the Arrow data type to use for named columns. If specified, the input should be an object with column names for keys and Arrow data types for values. Type values must be instantiated Flechette DataType instances (for example, float64(),dateDay(), list(int32()) etc.). If a column’s data type is not explicitly provided, type inference will be performed.
   * @param options.useBigInt: Boolean flag (default false) to extract 64-bit integer types as JavaScript BigInt values. For Flechette tables, the default is to coerce 64-bit integers to JavaScript numbers and raise an error if the number is out of range. This option is only applied when parsing IPC binary data, otherwise the settings of the provided table instance are used.
   * @param options.useDate: Boolean flag (default true) to convert Arrow date and timestamp values to JavaScript Date objects. Otherwise, numeric timestamps are used. This option is only applied when parsing IPC binary data, otherwise the settings of the provided table instance are used.
   * @param options.useDecimalBigInt: Boolean flag (default false) to extract Arrow decimal-type data as BigInt values, where fractional digits are scaled to integers. Otherwise, decimals are (sometimes lossily) converted to floating-point numbers (default). This option is only applied when parsing IPC binary data, otherwise the settings of the provided table instance are used.
   * @param options.useMap: Boolean flag (default false) to represent Arrow Map data as JavaScript Map values. For Flechette tables, the default is to produce an array of [key, value] arrays. This option is only applied when parsing IPC binary data, otherwise the settings of the provided table instance are used.
   * @param options.useProxy: Boolean flag (default false) to extract Arrow Struct values and table row objects using zero-copy proxy objects that extract data from underlying Arrow batches. The proxy objects can improve performance and reduce memory usage, but do not support property enumeration (Object.keys, Object.values, Object.entries) or spreading ({ ...object }). This option is only applied when parsing IPC binary data, otherwise the settings of the provided table instance are used.
   * @returns
   */
  async storeArrowTable(
    path: string,
    table: aq.ColumnTable,
    options: {
      columns?: string[];
      limit?: number;
      offset?: number;
      // types?: Record<string, unknown>; // https://idl.uw.edu/flechette/api/data-types
      useBigInt?: boolean;
      useDate?: boolean;
      useDecimalBigInt?: boolean;
      useMap?: boolean;
      useProxy?: boolean;
    },
  ) {
    const data = table.toArrowIPC({
      ...options,
      format: "stream",
    });
    const input = this.io.toDataIterator(data);
    const compressedInput = this.io.compresse(input);
    await this.io.write(path, compressedInput);
  }

  async loadArrowTable(path: string): Promise<aq.ColumnTable> {
    // // To use with the arquero v8:
    // const input = this.io.readStream(path);
    // const dt = await aq.fromArrow(input);
    const compressedInput = this.io.read(path);
    const decompressedStream = this.io.decompresse(compressedInput);
    const data = await this.io.toDataFromIterator(decompressedStream);
    const dt = aq.fromArrow(data);
    return dt;
  }

  async loadCsvTable(path: string): Promise<aq.ColumnTable> {
    let delimiter = ",";
    {
      const input = this.io.read(path);
      const textInput = this.io.decode(input);
      const lines = this.io.toLines(textInput);
      for await (const line of lines) {
        const splittedLine = splitDsv(line);
        delimiter = splittedLine.delimiter ?? delimiter;
        break;
      }
    }

    let dt: aq.ColumnTable;
    {
      // // To use with the arquero v8:
      // const input = this.io.read(path);
      // const csvReadableStream = this.io.toReadableStream(path);
      // const dt = await aq.fromCSVStream(csvReadableStream, {
      //   header: true,
      //   delimiter,
      // });
      const input = this.io.read(path);
      const textInput = this.io.decode(input);
      const csv = await this.io.toText(textInput);
      dt = aq.fromCSV(csv, {
        header: true,
        autoType: false,
        delimiter,
      });
    }
    return dt;
  }
}
