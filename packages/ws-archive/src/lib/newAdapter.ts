/**
 * This function allows to bind a typed value to a key in the adaptable objects.
 * It provides get / set functions allowing typed access to the bound value.
 * The getter method returns the value associated with the key in the object.
 * The setter method binds the given value to the key.
 *
 * Example:
 * ```typescript
 * const myObject = { "context.key": "A" };
 * const [getValue, setValue] = newAdapter<string>("context.key", false);
 * let value = getValue(myObject);
 * // It returns "A"
 *
 * setValue("B", myObject);
 * value = getValue(myObject);
 * // It returns "B"
 * // The adaptable object now looks like so: { "context.key" : "B" }
 * ```
 *
 * @param key the key of the context object
 * @returns a getter and a setter for the context object; both methods receive a stack of context objects
 */
export function newAdapter<T, A = unknown, K extends string | number = string>(
  key: K,
): [(obj: A) => T, (obj: A, value: T) => T] {
  return [
    function get(obj: A): T {
      return (obj as Record<K, T>)[key];
    },
    function set(obj: A, value: T): T {
      if (value === undefined) {
        delete (obj as Record<K, T>)[key];
      } else {
        (obj as Record<K, T>)[key] = value;
      }
      return value;
    },
  ];
}

/**
 * This function returns a method to get a value associated with the specified key.
 * The method tries to get an existing value for the specified key and if such a value
 * is not defined in the adaptable object then it creates a new adapter using the provided
 * `create` method.
 *
 * @param key the key of the context object
 * @param create the function to create a new value
 * @returns a getter for the context object; the method receives a stack of context objects
 */
export function getAdapter<T, A = unknown, K extends string | number = string>(
  key: K,
  create: (adaptable: A) => T,
): [get: (adaptable: A) => T, remove: (adaptable: A) => void] {
  const [get, set] = newAdapter<T | undefined, A, K>(key);
  return [
    (adaptable: A) => {
      return get(adaptable) ?? (set(adaptable, create(adaptable)) as T);
    },
    (adaptable: A) => set(adaptable, undefined),
  ];
}
