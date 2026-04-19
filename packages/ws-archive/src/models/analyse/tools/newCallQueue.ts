/**
 * This function allows to call specified functions in a queue, one after
 * the other: the next function will be called only after the previous
 * one has finished.
 * @param onError - a function that will be called if an error occurs
 * @returns a new call queue function
 */
export function newCallQueue<T, E = unknown>(
  onError: (error: E) => void = console.error,
) {
  let promise: Promise<T> = Promise.resolve(null!);
  return async (fn: () => Promise<T>): Promise<T> => {
    return (promise = promise.catch(onError).then(fn));
  };
}
