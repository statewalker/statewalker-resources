/**
 * Combines multiple values listeners into a single listener.
 * @param listener the combined listener accepting all values as an object
 * @param listeners a mapping of listeners to their keys
 * @returns a function to stop all listeners
 */
export function composeValues<T>(
  listener: (values: T) => void,
  listeners: {
    [key in keyof T]: (listener: (value: T[key]) => void) => () => void;
  },
): () => void {
  let values: T = {} as T;
  const entries = Object.entries(listeners) as [
    keyof T,
    (listener: (value: T[keyof T]) => void) => () => void,
  ][];
  let notify: undefined | ((values: T) => void);
  const stopListeners = entries.map(([key, cb]) =>
    cb((value) => {
      values = { ...values, [key]: value };
      notify?.(values);
    }),
  );
  notify = listener;
  notify(values);
  return () => stopListeners.forEach((stop) => stop?.());
}

/**
 * Combines multiple values listeners into a single listener.
 * @param listener the listener accepting all values as an array
 * @param listeners list of listeners providing indvidual values
 * @returns a function to stop all listeners
 */
export function composeList<T extends unknown[]>(
  listener: (...values: T) => void,
  ...listeners: ((listener: (value: T[number]) => void) => () => void)[]
): () => void {
  const values = new Array(listeners.length) as T;
  let notify: undefined | ((...values: T) => void);
  const stopListeners = listeners.map((cb, idx) =>
    cb((value) => {
      values[idx] = value;
      notify?.(...values);
    }),
  );
  notify = listener;
  notify(...values);
  return () => stopListeners.forEach((stop) => stop?.());
}
