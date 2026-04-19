export type Tokenizer = (value: unknown) => string[];
export const defaultTokenizer: Tokenizer = (value: unknown) =>
  String(value)
    .toLowerCase()
    .split(/[\s_"';!]+/gim)
    .map((s) => s.trim())
    .filter(Boolean);
