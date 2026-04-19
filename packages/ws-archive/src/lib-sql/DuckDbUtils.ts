
import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

export async function toByteArray(
  data: Uint8Array | string | Blob,
): Promise<Uint8Array> {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  return data;
}


export async function attachDataFile({
  db, data, name,
}: {
  db: AsyncDuckDB,
  data: string | Uint8Array | Blob,
  name: string,
}) {
  const bytes = await toByteArray(data);
  await db.registerFileBuffer(name, bytes);
}

export function copyData(src: Uint8Array): Uint8Array {
  const dst = new ArrayBuffer(src.byteLength);
  const resultArray = new Uint8Array(dst);
  resultArray.set(src);
  return resultArray;
}

export function newTmpFileName({
  prefix = "",
  ext = ".data",
}: {
  prefix?: string,
  ext?: string;
} = {}): string {
  const [date, time] = new Date()
    .toISOString()
    .split(".")[0]
    .split("T");
  const [hour, minute, second] = time.split(":");
  return `${prefix}${date}.${hour}h${minute}m${second}s${ext}`;
}

export async function convertQueryToParquet({
  db,
  query,
}: {
  db: AsyncDuckDB;
  query: string;
}): Promise<Blob> {

  const tmpFileName = newTmpFileName({ ext: '-result.parquet' });
  const connection = await db.connect();
  try {
    await connection.query(`COPY (${query}) TO '${tmpFileName}' (FORMAT parquet,ROW_GROUP_SIZE 100_000)`);
    try {
      const parquetBuffer = await db.copyFileToBuffer(tmpFileName);
      return new Blob([parquetBuffer], { type: "application/parquet" });
    } finally {
      await db.dropFile(tmpFileName);
    }
  } finally {
    await connection.close();
  }
}

export async function csvToParquet({
  db,
  data,
  delimiter = ",",
  header = true,
  normalizeNames = true,
  quote = '"',
}: {
  db: AsyncDuckDB;
  data: string | Uint8Array | Blob;
  delimiter?: string;
  header?: boolean;
  normalizeNames?: boolean;
  quote?: string;
}): Promise<Blob> {
  const tmpFileName = newTmpFileName({ prefix: '', ext: '-import.csv' });
  try {
    const bytes = await toByteArray(data);
    await db.registerFileBuffer(tmpFileName, bytes);

    const params = Object.entries({
      delim: delimiter ? `'${delimiter}'` : undefined,
      header: header ? "true" : undefined,
      ignore_errors: "true",
      normalize_names: normalizeNames,
      quote: quote ? `'${quote}'` : undefined,
    })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    const query = `SELECT * FROM read_csv('${tmpFileName}', ${params})`;
    return await convertQueryToParquet({ db, query });
  } finally {
    await db.dropFile(tmpFileName);
  }

}