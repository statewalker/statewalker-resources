import { type DataType, utf8 } from "@uwdata/flechette";
import * as aq from "arquero";
import { DuckDBClient } from "../../lib-sql/DuckDbClient.js";

export async function getDuckDbFromDataSets<D>(
  dataSets: Record<string, D>,
  getTable: (dataSet: D) => aq.ColumnTable | Promise<aq.ColumnTable>,
  getColumnTypes: (dataSet: D) => Record<string, DataType> | Promise<Record<string, DataType>>
): Promise<DuckDBClient> {
  const db = await DuckDBClient.of();
  const connection = await db._db.connect();
  try {
    const options = {
      schema: "main",
    };
    const entries = Object.entries(dataSets);
    for (const [name, dataSet] of entries) {
      const table = await getTable(dataSet);
      // const columns = table.columnNames();
      // const types = columns.reduce((acc, column) => {
      //   acc[column] = utf8();
      //   return acc;
      // }, {} as Record<string, DataType>);
      const originalTypes = await getColumnTypes(dataSet);

      const columns: Record<string, string[]> = Object
        .keys(originalTypes)
        .reduce((acc, columnName) => {
          const length = table.numRows();
          const getter = table.getter(columnName);
          const vals = new Array(length);
          for (let i = 0; i < length; i++) {
            vals[i] = String(getter(i));
          }
          acc[columnName] = vals;
          return acc;
        }, {} as Record<string, string[]>);
      const tableToImport = aq.table(columns);
      const types = Object.keys(originalTypes).reduce((acc, column) => {
        acc[column] = utf8();
        return acc;
      }, {} as Record<string, DataType>);

      const data = tableToImport.toArrowIPC({
        types
      });
      await connection.insertArrowFromIPCStream(data, {
        ...options,
        name,
      });
    }
    return db;
  } finally {
    await connection.close();
  }
}
