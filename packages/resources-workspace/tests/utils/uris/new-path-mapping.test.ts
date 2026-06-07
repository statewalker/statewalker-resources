import { describe, expect, it } from "vitest";
import { newPathMapping } from "../../../src/utils/uris/new-path-mapping.js";
import tests from "./new-path-mapping.data.js";

describe("newPathMapping", () => {
  for (const { message, mapping, uris } of tests) {
    it(message, () => {
      const map = newPathMapping(mapping);
      expect(typeof map).toBe("function");
      for (const [path, control] of uris as [string, string | null][]) {
        expect(map(path)).toEqual(control);
      }
    });
  }
});
