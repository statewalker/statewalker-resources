import {
  ContentReadAdapter,
  ContentWriteAdapter,
  Project,
  ResourceRepository,
  TextAdapter,
  Workspace,
} from "@statewalker/resources-workspace";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import {
  CrossWikiRefError,
  formatCitation,
  InvalidWikiPathError,
  isCrossWiki,
  normalizeWikiUri,
  openWiki,
  parseCitation,
  parseWikiUri,
  toCanonical,
  validateWikiPath,
  WikiKeyError,
} from "../../src/index.js";

describe("wiki:// URI scheme", () => {
  it("normalizes every input form to one local path", () => {
    const forms = ["wiki:///notes/a.md", "/notes/a.md", "notes/a.md"];
    const normalized = forms.map((f) => normalizeWikiUri(f, "chem-lab"));
    expect(normalized).toEqual(["notes/a.md", "notes/a.md", "notes/a.md"]);
  });

  it("normalizes a matching-key URI to the bare local path", () => {
    expect(normalizeWikiUri("wiki://chem-lab/notes/a.md", "chem-lab")).toBe("notes/a.md");
  });

  it("classifies a foreign key as cross-wiki and rejects it on normalize", () => {
    expect(isCrossWiki("wiki://other/notes/a.md", "chem-lab")).toBe(true);
    expect(isCrossWiki("wiki://chem-lab/notes/a.md", "chem-lab")).toBe(false);
    expect(isCrossWiki("notes/a.md", "chem-lab")).toBe(false);
    expect(() => normalizeWikiUri("wiki://other/notes/a.md", "chem-lab")).toThrow(
      CrossWikiRefError,
    );
  });

  it("produces a fully-qualified canonical form", () => {
    expect(toCanonical({ path: "notes/a.md", section: "intro" }, "chem-lab")).toBe(
      "wiki://chem-lab/notes/a.md#intro",
    );
    expect(toCanonical({ key: "other", path: "notes/a.md" }, "chem-lab")).toBe(
      "wiki://other/notes/a.md",
    );
  });

  it("round-trips a citation", () => {
    const ref = { key: "chem-lab", path: "notes/a.md", section: "intro" };
    const citation = formatCitation(ref);
    expect(citation).toBe("[[wiki://chem-lab/notes/a.md#intro]]");
    const parsed = parseCitation(citation);
    expect(parsed.key).toBe(ref.key);
    expect(parsed.path).toBe(ref.path);
    expect(parsed.section).toBe(ref.section);
  });

  it("parses host:key authority", () => {
    const ref = parseWikiUri("wiki://example.com:chem-lab/notes/a.md");
    expect(ref.host).toBe("example.com");
    expect(ref.key).toBe("chem-lab");
    expect(ref.path).toBe("notes/a.md");
  });

  it("rejects a malformed path", () => {
    expect(() => parseWikiUri("notes//a.md")).toThrow();
    expect(() => parseWikiUri("../escape.md")).toThrow();
  });
});

// Migrated from wiki-runtime/tests/uri.test.ts — path-validation parity for the
// bare internal URI (now validateWikiPath).
describe("validateWikiPath (migrated path-validation parity)", () => {
  it("accepts source-relative paths with extensions", () => {
    expect(() => validateWikiPath("acme.md")).not.toThrow();
    expect(() => validateWikiPath("notes/guide/intro.pdf")).not.toThrow();
  });

  it("treats two files differing only by extension as distinct, valid URIs", () => {
    expect("acme.pdf").not.toBe("acme.md");
    expect(() => validateWikiPath("acme.pdf")).not.toThrow();
    expect(() => validateWikiPath("acme.md")).not.toThrow();
  });

  it("rejects empty / leading-slash / trailing-slash / double-slash paths", () => {
    expect(() => validateWikiPath("")).toThrow(InvalidWikiPathError);
    expect(() => validateWikiPath("/a.md")).toThrow(InvalidWikiPathError);
    expect(() => validateWikiPath("a/")).toThrow(InvalidWikiPathError);
    expect(() => validateWikiPath("a//b.md")).toThrow(InvalidWikiPathError);
  });

  it("rejects '.' / '..' segments and '#'", () => {
    expect(() => validateWikiPath("../escape.md")).toThrow(InvalidWikiPathError);
    expect(() => validateWikiPath("a/../b.md")).toThrow(InvalidWikiPathError);
    expect(() => validateWikiPath("./x.md")).toThrow(InvalidWikiPathError);
    expect(() => validateWikiPath("a#b.md")).toThrow(InvalidWikiPathError);
  });
});

describe("openWiki — key bound to project name", () => {
  function newRepository(files: Record<string, string>) {
    const repository = new ResourceRepository({
      filesApi: new MemFilesApi({ initialFiles: files }),
    });
    repository.register("", ContentReadAdapter);
    repository.register("", ContentWriteAdapter);
    repository.register("", TextAdapter);
    repository.register("", Project);
    repository.register(ResourceRepository, Workspace);
    return repository;
  }

  it("opens a project whose name is a valid key", async () => {
    const repository = newRepository({ "chem-lab/a.md": "# A" });
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    const wiki = await openWiki(workspace, "chem-lab");
    expect(wiki?.projectName).toBe("chem-lab");
  });

  it("rejects creating a wiki with an invalid key", async () => {
    const repository = newRepository({});
    const workspace = repository.requireAdapter<Workspace>(Workspace);
    await expect(openWiki(workspace, "Lab Journal", true)).rejects.toThrow(WikiKeyError);
  });
});
