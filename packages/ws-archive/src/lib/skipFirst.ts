/**
 * Wraps a listener function to skip the first call.
 * This is useful when you want to ignore the initial value and only react to subsequent changes.
 *
 * @param listener - The listener function to wrap.
 * @returns A new listener function that skips the first call and then calls the original listener on subsequent calls.
 *
 * @example
 * const field = newField(42);
 *
 * // Create a listener that skips the first call
 * const listener = skipFirst((value) => {
 *   console.log("Value changed to:", value);
 * });
 *
 * // Listen for changes to the field value
 * const stopListening = field(listener);
 *
 * // Change the value
 * field.value = 100; // Console: "Value changed to: 100"
 * field.value = 200; // Console: "Value changed to: 200"
 *
 * // Stop listening for changes
 * stopListening();
 */
export function skipFirst<T>(listener: (value: T) => void): (value: T) => void {
  let first = true;
  return (value: T) => {
    if (first) {
      first = false;
      return;
    }
    listener(value);
  };
}
