import { isAsyncIterable } from "./isAsyncIterable.js";

export type MaybeIterable<T> = T | T[] | Iterable<T> | AsyncIterable<T>;
export async function* toFlatten<T>(
  input: MaybeIterable<unknown>,
): AsyncGenerator<T> {
  if (isAsyncIterable(input)) {
    for await (const entry of input) {
      yield* toFlatten<T>(entry);
    }
  } else {
    yield input as T;
  }
}
