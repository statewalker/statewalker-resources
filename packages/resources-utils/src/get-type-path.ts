export function getTypePath(type: any, separator = "/"): string {
  if (typeof type !== "function") type = type.constructor;
  return toPath(type).join(separator);
  function toPath(type: any, path: string[] = []): string[] {
    if (!type || !type.name) return path;
    path.unshift(type.name);
    return toPath(Object.getPrototypeOf(type), path);
  }
}
