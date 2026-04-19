export function isAsyncIterable<T>(obj: unknown): obj is AsyncIterable<T> {
  if (obj === undefined || obj === null) {
    return false;
  }
  if (typeof obj !== "object") {
    return false;
  }
  if (typeof (obj as any)[Symbol.asyncIterator] === "function") {
    return true;
  }
  return false;
}
