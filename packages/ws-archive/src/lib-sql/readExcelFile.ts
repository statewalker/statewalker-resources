import type { Workbook } from "npm:exceljs";
export type { Workbook };

export async function* readExcelFile(
  workbook: Workbook,
  sheetName: string,
): AsyncGenerator<Record<string, unknown>> {
  const rawData = await workbook.sheet(sheetName, { headers: true });
  const [headers, ...data] = [...rawData];
  for (const d of data) {
    const entries = Object.entries(d).map(([key, value], idx) => {
      return [headers[key], value];
    });
    yield Object.fromEntries(entries);
  }
}
