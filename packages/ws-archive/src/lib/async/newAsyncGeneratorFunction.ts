import { newAsyncGenerator } from "./newAsyncGenerator.js";

export function newAsyncGeneratorFunction<T>(
  listen: (next: (value: T) => void) => undefined | (() => void),
): () => AsyncGenerator<T> {
  return async function* () {
    yield* newAsyncGenerator(listen);
  };
}
