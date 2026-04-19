import type * as aq from "arquero";
import type { Tokenizer } from "./tokenizer.js";

export type TableSearch = (params: {
  query: string;
  logic?: "and" | "or";
}) => Promise<aq.BitSet>;

export type TableSearchProvider = (params: {
  rows: aq.BitSet;
  tokenizer?: Tokenizer;
  fieldsProviders: Record<string, (row: number) => unknown>;
}) => Promise<TableSearch>;
