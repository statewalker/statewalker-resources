import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Parity guard: runtime source under every resources-* package's `src/` must run in
// Node AND the browser, so it must not import `node:*` builtins. Tests (this file
// included) may use node builtins freely — only `src/` is checked.

const packagesDir = resolve(import.meta.dirname, "../..");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const NODE_IMPORT = /\bfrom\s+["']node:|\bimport\s*\(\s*["']node:|\brequire\(\s*["']node:/;

describe("resources-* src is free of node:* imports", () => {
  const pkgs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const pkg of pkgs) {
    const srcDir = join(packagesDir, pkg, "src");
    let files: string[] = [];
    try {
      files = tsFiles(srcDir);
    } catch {
      continue; // no src/ — skip
    }
    it(`${pkg}/src has no node:* imports`, () => {
      const offenders = files.filter((f) => NODE_IMPORT.test(readFileSync(f, "utf8")));
      expect(offenders).toEqual([]);
    });
  }
});
