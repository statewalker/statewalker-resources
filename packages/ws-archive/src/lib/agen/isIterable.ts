export function isIterable<T>(obj: unknown): obj is Iterable<T> {
  if (obj === undefined || obj === null) {
    return false;
  }
  if (typeof obj !== "object") {
    return false;
  }
  if (typeof (obj as any)[Symbol.iterator] === "function") {
    return true;
  }
  return false;
}
