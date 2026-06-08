import { describe, expect, it } from "vitest";
import { makeProjectIgnore } from "../../src/builders/project-ignore.js";

describe("makeProjectIgnore", () => {
  it("excludes nothing for empty/missing/comment-only input", () => {
    for (const text of [undefined, "", "\n  \n", "# just a comment\n"]) {
      const ignore = makeProjectIgnore(text);
      expect(ignore("reports/a.md")).toBe(false);
      expect(ignore("a.md")).toBe(false);
    }
  });

  it("excludes a directory and everything beneath it", () => {
    const ignore = makeProjectIgnore("reports\n");
    expect(ignore("reports")).toBe(true);
    expect(ignore("reports/from-bex/notes.md")).toBe(true);
    expect(ignore("docs/reports.md")).toBe(false); // a file named like the dir is kept
    expect(ignore("guide.md")).toBe(false);
  });

  it("matches an unanchored name at any depth", () => {
    const ignore = makeProjectIgnore("drafts/\n");
    expect(ignore("drafts/x.md")).toBe(true);
    expect(ignore("a/b/drafts/x.md")).toBe(true);
    expect(ignore("a/b/c.md")).toBe(false);
  });

  it("anchors a pattern that contains a slash to the project root", () => {
    const ignore = makeProjectIgnore("reports/from-bex\n");
    expect(ignore("reports/from-bex/notes.md")).toBe(true);
    expect(ignore("other/reports/from-bex/notes.md")).toBe(false);
    const rooted = makeProjectIgnore("/reports\n");
    expect(rooted("reports/x.md")).toBe(true);
    expect(rooted("a/reports/x.md")).toBe(false);
  });

  it("supports * (within segment), ** (across) and ? globs", () => {
    expect(makeProjectIgnore("*.pdf\n")("a/b/file.pdf")).toBe(true);
    expect(makeProjectIgnore("*.pdf\n")("a/b/file.md")).toBe(false);
    expect(makeProjectIgnore("tmp-?\n")("dir/tmp-1")).toBe(true);
    expect(makeProjectIgnore("build/**\n")("build/a/b.js")).toBe(true);
  });

  it("re-includes with a later negation (last match wins)", () => {
    const ignore = makeProjectIgnore("reports\n!reports/keep.md\n");
    expect(ignore("reports/drop.md")).toBe(true);
    expect(ignore("reports/keep.md")).toBe(false);
  });
});
