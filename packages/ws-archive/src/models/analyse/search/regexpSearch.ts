import * as aq from "arquero";
import { type Tokenizer, defaultTokenizer } from "./tokenizer.js";
import type { TableSearch } from "./types.js";

export async function regexpSearchProvider({
  tokenizer = defaultTokenizer,
  fieldsProviders,
  rows,
}: {
  rows: aq.BitSet;
  tokenizer?: Tokenizer;
  fieldsProviders: Record<string, (row: number) => unknown>;
}): Promise<TableSearch> {
  return async ({
    query,
    logic = "and",
  }: {
    query: string;
    logic?: "and" | "or";
  }): Promise<aq.BitSet> => {
    const filters: aq.BitSet[] = [];
    let matchFunctions = toCompiledJsFunctions({
      query,
      fieldsProviders
    });
    if (!matchFunctions?.length) {
      matchFunctions = toScanSearchFunctions({
        query,
        fieldsProviders,
        tokenizer,
      });
    }

    const n = rows.count();
    for (let t = 0, len = matchFunctions.length ?? 0; t < len; t++) {
      const match = matchFunctions[t];
      const filter = new aq.BitSet(n);
      for (let i = rows.next(0); i >= 0; i = rows.next(i + 1)) {
        if (match(i)) {
          filter.set(i);
        }
      }
      filters.push(filter);
    }
    const filter = filters[0];
    for (let i = 1, len = filters.length; i < len; i++) {
      logic === "and" ? filter.and(filters[i]) : filter.or(filters[i]);
    }
    return filter;
  };
}

// -------------------------------------------------------------------------
// Basic RegExp-based table search

function toCompiledJsFunctions({
  query,
  fieldsProviders,
}: {
  query: string;
  fieldsProviders: Record<string, (row: number) => unknown>;
}): ((row: number) => boolean)[] {
  const isSimpleExpression = query[0] === ":";
  const isCompiled = query[0] === "?" || isSimpleExpression;
  if (!isCompiled) {
    return [];
  }
  return [toCompiledJsFunction({ query: query.slice(1), fieldsProviders, isSimpleExpression })];
}
function toCompiledJsFunction({
  query,
  fieldsProviders,
  isSimpleExpression = true
}: {
  query: string;
  fieldsProviders: Record<string, (row: number) => unknown>;
  isSimpleExpression: boolean;
}): (row: number) => boolean {
  const entries = Object.entries(fieldsProviders);
  // const fieldsGetters = Object.values(fieldsProviders);
  try {
    let currentRow = 0;
    const proxyObject = new Proxy({}, {
      get(target, prop) {
        const getter = fieldsProviders[String(prop)];
        return getter?.(currentRow);
      }
    });
    const code = isSimpleExpression ? `return (\n${query.trim()}\n)` : `\n${query.trim()}\n`;
    const f = new Function("row", code).bind(proxyObject);
    return (row: number) => {
      currentRow = row;
      return f(proxyObject);
    };
  } catch (e) {
    const fields = Object.keys(fieldsProviders);
    throw new Error(
      `Invalid expression: ${query}. Fields: "${fields.join(", ")}"`,
    );
  }
}

function toScanSearchFunctions({
  query,
  fieldsProviders,
  tokenizer,
}: {
  query: string;
  fieldsProviders: Record<string, (row: number) => unknown>;
  tokenizer: Tokenizer;
}): ((row: number) => boolean)[] {
  const fieldsGetters = Object.values(fieldsProviders);
  const searchTokens = tokenizer(query);
  return searchTokens.map((searchToken) => {
    const re = getRegExp(searchToken);
    const test = (value: unknown) => String(value).match(re);
    return (row: number) => {
      for (const get of fieldsGetters) {
        const value = get(row);
        if (test(value)) {
          return true;
        }
      }
      return false;
    };
  });
}

function getRegExp(query: string) {
  if (query === "") {
    return /(?:)/gim;
  }
  if (query[0] === "^") {
    return new RegExp(query, "gim");
  }
  const str = query.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
  return new RegExp(str, "gim");
}

// https://github.com/uwdata/arquero/blob/main/src/verbs/derive.js
function search(
  predicate: (
    row: number,
    data: Record<string, { at: (row: number) => unknown }>,
  ) => boolean,
) {
  const bits = table.mask();
  const data = table.data();
  const filter = new aq.BitSet(n);

  // inline the following for performance:
  // table.scan((row, data) => { if (predicate(row, data)) filter.set(row); });
  for (let i = bits.next(0); i >= 0; i = bits.next(i + 1)) {
    if (predicate(i, data)) {
      filter.set(i);
    }
  }

  return filter;
}
