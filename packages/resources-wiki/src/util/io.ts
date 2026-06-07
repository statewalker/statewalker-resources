import { dirname, type FilesApi, tryReadText, writeText } from "@statewalker/webrun-files";

export async function tryReadJson<T>(files: FilesApi, path: string): Promise<T | undefined> {
  const text = await tryReadText(files, path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function writeAtomic(files: FilesApi, path: string, text: string): Promise<void> {
  const parent = dirname(path);
  if (parent && parent !== "/") await files.mkdir(parent);
  const tmp = `${path}.tmp`;
  await writeText(files, tmp, text);
  const moved = await files.move(tmp, path);
  if (!moved) throw new Error(`writeAtomic: failed to rename ${tmp} to ${path}`);
}

export function writeJsonAtomic(files: FilesApi, path: string, value: unknown): Promise<void> {
  return writeAtomic(files, path, JSON.stringify(value, null, 2));
}

export function writeTextAtomic(files: FilesApi, path: string, text: string): Promise<void> {
  return writeAtomic(files, path, text);
}

export { tryReadText };
