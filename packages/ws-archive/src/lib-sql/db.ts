export type DbEntry = Record<string, unknown>;
export type Db = {
  query<T = DbEntry>(sql: string, args?: unknown[]): Promise<T[]>;
};

export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "BLOB";

export async function addDbTable(
  db: Db,
  {
    tableName,
    columns,
    content,
    onItem,
  }: {
    tableName: string;
    columns?: Record<string, ColumnType>;
    content: () => AsyncGenerator<DbEntry>;
    onItem?: (entry: DbEntry, idx: number) => void;
  },
) {
  for await (const item of loadInDbTable(db, { tableName, columns, content })) {
    onItem?.(item, 0);
  }
  return await getBasicTableInfo(db, tableName);
}

export async function getBasicTableInfo(db: Db, tableName: string) {
  const result = await db.query(
    `SELECT * FROM PRAGMA_TABLE_INFO('${tableName}')`,
  );
  const columnsInfo: Record<string, ColumnType> = {};
  for (const row of result) {
    columnsInfo[row.name as string] = row.type as ColumnType;
  }
  return columnsInfo;
}

export async function createDbTable(
  db: Db,
  {
    tableName,
    columns,
  }: {
    tableName: string;
    columns: Record<string, ColumnType>;
  },
) {
  const columnsArray = Object.entries(columns);
  const columnsDef = columnsArray
    .map(([name, type]) => `"${name}" ${type}`)
    .join(", ");
  await db.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (${columnsDef})`);
  return columnsArray;
}

export async function* loadInDbTable(
  db: Db,
  {
    tableName,
    columns,
    content,
  }: {
    tableName: string;
    columns?: Record<string, ColumnType>;
    content: () => AsyncGenerator<DbEntry>;
  },
) {
  let columnsArray: [string, ColumnType][] = [];
  let stmt: string | undefined;
  for await (const entry of content()) {
    if (stmt === undefined) {
      if (!columns) {
        columns = Object.fromEntries(
          Object.entries(entry).map(([name, value]) => {
            if (typeof value === "string") {
              return [name, "TEXT"];
            }
            if (typeof value === "number") {
              return [name, Number.isInteger(value) ? "INTEGER" : "REAL"];
            }
            if (typeof value === "boolean") {
              return [name, "INTEGER"];
            }
            if (value === null) {
              return [name, "TEXT"];
            }
            return [name, "TEXT"];
          }),
        );
      }

      columnsArray = await createDbTable(db, { tableName, columns });
      stmt = `INSERT INTO ${tableName} VALUES (${columnsArray.map(() => "?").join(", ")})`;
    }
    const row = columnsArray.map(([name]) => {
      const value = entry[name];
      if (value === undefined) {
        return null;
      }
      if (typeof value === "boolean") {
        return value ? 1 : 0;
      }
      if (value !== null && typeof value === "object") {
        return JSON.stringify(value);
      }
      return value;
    });
    await db.query(stmt, row);
    yield entry;
  }
}
