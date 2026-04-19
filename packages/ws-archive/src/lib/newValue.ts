export type Value<T> = [
  // Return the current value
  get: () => T,
  // Set a new value
  set: (value: T) => void,
  // Listen for changes
  listen: (listener: (value: T) => void) => () => void,
];

/**
 * Create a new value with a getter, setter, and listener.
 * @param value the initial value
 * @param equals the equality function to compare values
 * @returns a listener function with a getter and setter
 */
export function newValue<T = unknown>(
  value: T,
  equals: (a: T, b: T) => boolean = Object.is,
): Value<T> {
  let listenerId = 0;
  const listeners: Record<number, () => void> = {};

  function get(): T {
    return value;
  }

  function set(val: T): void {
    if (equals(value, val)) {
      return;
    }
    value = val;
    for (const listener of Object.values(listeners)) {
      listener();
    }
  }

  function listen(listener: (value: T) => void): () => void {
    const id = listenerId++;
    const notify = () => listener?.(value);
    notify();
    listeners[id] = notify;
    return () => delete listeners[id];
  }
  return [get, set, listen];
}
