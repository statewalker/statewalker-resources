/**
 * This method returns a function giving access to a "memoised" object. The returned function
 * has a "reset" method and the "ref" field:
 * - `reference.reset()` - remove the current reference on the  memoised object
 * - `reference.ref` - this field contains the current WeakRef on the object
 *
 * @param {*} deps - list of references to dependencies; all dependencies should be
 * references returned by this method
 * @param {*} create - a function accepting resolved dependencies
 * (in the same order as they declared in the "deps" list);
 * this function should return an Object instance corresponding to this reference.
 * @returns a function providing access to the latest object returned by the "create" method
 *
 * Example 1 - use a reference to an object:
 * ```js
 *  class MyClass { ... }
 *  const reference = newReference(() => new MyClass())
 *  const one = reference();
 *  const two = reference();
 *  assert(one === two);
 * ```
 *
 * Example 2 - reset (cleanup) the reference:
 * ```js
 *  class MyClass { ... }
 *  const reference = newReference(() => new MyClass())
 *  const one = reference();
 *  reference.reset();
 *  const two = reference();
 *  // Now the variable "two" contains another instance of the MyClass type:
 *  assert(one !== two);
 * ```
 *
 * Example 3 - automatic refresh when dependencies are changed:
 * ```js
 *  let content = "# Hello, world"
 *  const contentRef = newReference(() => ({ content }))
 *  const astRef = newReference([contentRef], ({ content }) => {
 *    return parseMarkdown(content);
 *  })
 *  // Now we can use the "astRef" to get the first version of the markdown AST:
 *  const ast1 = astRef();
 *  // ...
 *
 *  // Update the raw content and cleanup the reference to this content:
 *  content = "# Hello Wonderful World\n\n- item one\n- item two";
 *  contentRef.reset();
 *
 *  // Now the astRef will return a new instance of the AST:
 *  const ast2 = astRef();
 *  ...
 * ```
 */
export type Reference<T extends object> = ((
  ...deps: any[]
) => T | undefined) & {
  ref: WeakRef<T>;
  reset(): void;
};
export function newReference<T extends object = object>(
  deps: Reference<any>[],
  create: (...args: any[]) => T
): Reference<T> {
  const refs: WeakRef<object>[] = new Array(deps.length);
  let _weakRef: WeakRef<T> | undefined;
  function weakRef(): WeakRef<T> {
    const value = _weakRef?.deref();
    let updated = value === undefined;
    for (let i = 0; i < deps.length; i++) {
      const ref = deps[i].ref;
      updated = updated || refs[i] !== ref;
      refs[i] = ref;
    }
    if (!_weakRef || updated) {
      const args = refs.map((r) => r.deref());
      const obj = create(...args);
      _weakRef = new WeakRef<T>(obj);
    }
    return _weakRef;
  }
  function deref() {
    return weakRef().deref();
  }
  return Object.assign(
    Object.defineProperty(deref, "ref", {
      get: weakRef,
    }),
    { reset: () => ((_weakRef = undefined), deref) }
  );
}