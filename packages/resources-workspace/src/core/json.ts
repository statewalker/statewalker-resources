/** A JSON value: the result of `JSON.parse` / the input to `JSON.stringify`. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
