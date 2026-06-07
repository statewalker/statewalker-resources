import { describe, expect, it } from "vitest";
import { Adapters } from "../../src/utils/adapters.js";

describe("Adapters", () => {
  it("should be able to use adapters for empty types", () => {
    const a = new Adapters<string>();
    a.set("", "b", "FOOBAR");
    expect(a.get("a", "b")).toEqual("FOOBAR");
    expect(a.remove("", "b")).toEqual("FOOBAR");
    expect(a.get("a", "b")).toBe(undefined);
    expect(a.remove("", "b")).toBe(undefined);
  });

  it("should register, retrieve and remove an exact adapter", () => {
    const a = new Adapters<string>();
    a.set("a", "b", "FOOBAR");
    expect(a.get("a", "b")).toEqual("FOOBAR");
    expect(a.remove("a", "b")).toEqual("FOOBAR");
    expect(a.get("a", "b")).toBe(undefined);
    expect(a.remove("a", "b")).toBe(undefined);
  });

  it("the unsubscribe function returned by set() removes the adapter", () => {
    const a = new Adapters<string>();
    const remove = a.set("a", "b", "FOOBAR");
    expect(a.get("a", "b")).toEqual("FOOBAR");
    remove();
    expect(a.get("a", "b")).toBe(undefined);
  });

  it("should retrieve adapters by parent target keys", () => {
    const a = new Adapters<string>();
    a.set("menu", "file", "File menu");
    expect(a.get("menu", "file.text")).toEqual("File menu");
    expect(a.get("menu", "file.text.markdown")).toEqual("File menu");
    expect(a.getAll("menu", "file.text.markdown")).toEqual(["File menu"]);

    a.set("menu", "file.text", "Menu for text files");
    expect(a.get("menu", "file.text")).toEqual("Menu for text files");
    expect(a.get("menu", "file.text.markdown")).toEqual("Menu for text files");
    expect(a.getAll("menu", "file.text.markdown")).toEqual(["Menu for text files", "File menu"]);
  });

  it("should retrieve adapters by parent source keys", () => {
    const a = new Adapters<string>();
    a.set("menu", "file", "Show files in menus");
    expect(a.get("menu.context", "file")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor", "file")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor.code", "file")).toEqual("Show files in menus");

    a.set("menu.context.editor", "file", "Show files in context EDITOR menu");
    expect(a.get("menu.context", "file")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor", "file")).toEqual("Show files in context EDITOR menu");
    expect(a.get("menu.context.editor.code", "file")).toEqual("Show files in context EDITOR menu");

    expect(a.getAll("menu.context.editor.code", "file")).toEqual([
      "Show files in context EDITOR menu",
      "Show files in menus",
    ]);
  });

  it("should retrieve adapters by parent and source keys", () => {
    const a = new Adapters<string>();
    a.set("menu", "file", "Show files in menus");
    expect(a.get("menu.context", "file.text.javascript")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor", "file.text.javascript")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor.code", "file.text.javascript")).toEqual(
      "Show files in menus",
    );

    a.set("menu.context.editor", "file.text", "Show TEXT files in context EDITOR menu");
    a.set("menu.context.editor", "file.text.java", "Show Java source files in context EDITOR menu");
    expect(a.get("menu.context", "file.text")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor", "file")).toEqual("Show files in menus");
    expect(a.get("menu.context.editor", "file.text")).toEqual(
      "Show TEXT files in context EDITOR menu",
    );
    expect(a.get("menu.context.editor.code", "file.text.javascript")).toEqual(
      "Show TEXT files in context EDITOR menu",
    );
    expect(a.get("menu.context.editor.code", "file.text.java")).toEqual(
      "Show Java source files in context EDITOR menu",
    );

    expect(a.getAll("menu.context.editor.code", "file.text.java")).toEqual([
      "Show Java source files in context EDITOR menu",
      "Show TEXT files in context EDITOR menu",
      "Show files in menus",
    ]);
  });
});
