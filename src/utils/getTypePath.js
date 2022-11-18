export default function getTypePath(type, separator = "/") {
  if (typeof type !== "function") type = type.constructor;
  return toPath(type).join(separator);
  function toPath(type, path = []) {
    if (!type || !type.name) return path;
    path.unshift(type.name);
    return toPath(Object.getPrototypeOf(type), path);
  }
}