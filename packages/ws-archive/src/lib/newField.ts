/**
 * Type definition for a Field.
 * A Field is a function that takes a listener callback and returns a function to stop listening.
 * It also has a `value` property to get and set the current value.
 */
export type Field<T> = ((listener: (value: T) => void) => () => void) & {
  value: T;
};

/**
 * Creates a new Field with the given initial value.
 * A Field allows you to listen for changes to the value and get/set the value.
 *
 * @param value - The initial value of the Field.
 * @param equals - An optional function to compare the current value with a new value. Defaults to `Object.is`.
 * @returns A Field object with a `value` property and a listener function.
 *
 * @example
 * const field = newField(42);
 *
 * // Get the current value
 * console.log(field.value); // 42
 *
 * // Set a new value
 * field.value = 100;
 * console.log(field.value); // 100
 *
 * // Listen for changes to the value
 * const stopListening = field((newValue) => {
 *   console.log("Value changed to:", newValue);
 * });
 *
 * // Change the value
 * field.value = 200; // Console: "Value changed to: 200"
 *
 * // Stop listening for changes
 * stopListening();
 */
export function newField<T>(
  value: T,
  equals: (a: T, b: T) => boolean = () => false,
): Field<T> {
  // It also could be implemented as the following:
  // const [get, set, listen] = newValue<T>(value, equals);
  // return Object.defineProperty(listen, "value", { get, set }) as Field<T>;

  let listenerId = 0;
  const listeners: Record<number, () => void> = {};

  function listen(listener: (value: T) => void): () => void {
    const id = listenerId++;
    const notify = () => listener?.(value);
    notify();
    listeners[id] = notify;
    return () => delete listeners[id];
  }
  return Object.defineProperty(listen, "value", {
    get: () => value,
    set: (newValue: T) => {
      if (equals(value, newValue)) {
        return;
      }
      value = newValue;
      Object.values(listeners).forEach((notify) => notify());
    },
  }) as Field<T>;
}
