import type * as aq from "arquero";

export function getTableFieldsProvider({
  table,
  fields,
}: {
  table: aq.ColumnTable;
  fields?: string[];
}): Record<string, (row: number) => unknown> {
  const fieldsProviders: Record<string, (row: number) => unknown> = {};
  const allFields = new Set<string>(table.columnNames());
  let searchFieldsList: string[] = [];
  if (fields && fields?.length > 0) {
    fields = [...new Set(fields)];
    for (const searchField of fields) {
      if (!allFields.has(searchField)) {
        throw new Error(`Field "${searchField}" not found`);
      }
      searchFieldsList.push(searchField);
    }
  } else {
    searchFieldsList = [...allFields];
  }
  for (const field of searchFieldsList) {
    fieldsProviders[field] = table.getter(field);
  }
  return fieldsProviders;
}
