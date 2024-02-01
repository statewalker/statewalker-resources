import { describe, expect, it } from "../deps.ts";

import { newTypePathBuilder } from "@/adapters/index.ts";

describe("newPathSplitter", () => {
  const getTypePath = newTypePathBuilder("/");

  it(`should return a path for a hierarchy of types`, async () => {
    class A {}
    class B extends A {}
    class C extends B {}
    const type = getTypePath(C);
    expect(type).toEqual(["C", "B", "A"]);
  });

  it(`should return type path for a mixture of classes and strings`, async () => {
    class A {}
    class B extends A {}
    class C extends B {}
    const type = getTypePath("plain", "", "text", C, "hello", "", "", "world");
    expect(type).toEqual(["plain", "text", "C", "B", "A", "hello", "world"]);
  });
});
