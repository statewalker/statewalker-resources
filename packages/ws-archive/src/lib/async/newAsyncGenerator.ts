export async function* newAsyncGenerator<T>(
  listen: (next: (value: T) => void) => undefined | (() => void),
): AsyncGenerator<T> {
  let value: T = null!;
  let resolve: () => void = null!;
  let promise = new Promise<void>((r) => { resolve = r; });
  const unsubscribe = listen((val: T) => {
    value = val;
    resolve();
  });
  try {
    while (true) {
      await promise;
      yield value;
      promise = new Promise((r) => { resolve = r; });
    }
  } finally {
    unsubscribe?.();
  }
}
