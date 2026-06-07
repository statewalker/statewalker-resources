/** Build a `/`-separated path of constructor names up the prototype chain. */
export function getTypePath(type: unknown, separator = "/"): string {
  const ctor = typeof type === "function" ? type : (type as { constructor?: unknown })?.constructor;
  return toPath(ctor).join(separator);
}

function toPath(type: unknown, path: string[] = []): string[] {
  const named = type as { name?: string } | null | undefined;
  if (!named?.name) return path;
  path.unshift(named.name);
  return toPath(Object.getPrototypeOf(named), path);
}
