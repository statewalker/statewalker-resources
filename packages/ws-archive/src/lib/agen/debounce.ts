export function newDebounced<P, T, E = Error>(
  delay: number,
  action: (x: P) => T | Promise<T>,
) {
  let resolve: (x: T) => void;
  let reject: (error?: E) => void;
  let promise = new Promise<T>((y, n) => {
    resolve = y;
    reject = n;
  });
  let request: P = null!;
  let timerId: null | unknown;

  return async (req: P) => {
    request = req;
    timerId && clearTimeout(timerId as number);
    timerId = setTimeout(async () => {
      const [y, n] = [resolve, reject];
      promise = new Promise<T>((y, n) => {
        resolve = y;
        reject = n;
      });
      try {
        y(await action(request));
      } catch (error) {
        n(error as E);
      }
    }, delay);
    return promise;
  };
}
