export function listen<T>(
  it: AsyncIterator<T> | (() => AsyncIterator<T>),
  cb: (value: T) => void | Promise<void>,
  finalizer?: (error?: unknown) => void,
): () => void {
  const iterator = typeof it === "function" ? it() : it;
  let finalize: () => void = () => {};
  const end = new Promise<{ done: true; value?: T }>(
    (r) =>
      (finalize = () => {
        r({ done: true });
      }),
  );
  finalizer && end.then(() => {}).then(finalizer, finalizer);
  (async () => {
    try {
      while (true) {
        const { done, value } = await Promise.any([iterator.next(), end]);
        if (done) {
          break;
        }
        await cb(value);
      }
    } finally {
      finalize();
    }
  })();
  return () => {
    iterator?.return?.(void 0);
    finalize();
    return end;
  };
}
