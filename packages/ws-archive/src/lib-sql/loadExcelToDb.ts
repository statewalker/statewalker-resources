import { type Db, type DbEntry, loadInDbTable } from "./db.js";
import { type Workbook, readExcelFile } from "./readExcelFile.js";

export async function* loadExcelToDb(
  db: Db,
  workbook: Workbook,
  sheetsMapping?: Record<string, string>,
): AsyncGenerator<{
  tableName: string;
  tableIdx: number;
  entry: DbEntry;
}> {
  const mapping = !sheetsMapping
    ? Object.fromEntries(
        workbook.sheetNames.map((name: string) => [name, name]),
      )
    : sheetsMapping;

  for (const [sheetName, tableName] of Object.entries(mapping)) {
    let tableIdx = 0;
    for await (const entry of loadInDbTable(db, {
      tableName,
      content: async function* () {
        yield* readExcelFile(workbook, sheetName);
      },
    })) {
      yield { tableName, tableIdx, entry };
      tableIdx++;
    }
  }
}
