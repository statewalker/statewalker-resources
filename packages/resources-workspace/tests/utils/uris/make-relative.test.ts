import { describe, expect, it } from "vitest";
import { makeRelative } from "../../../src/utils/uris/make-relative.js";
import tests from "./make-relative.data.js";

describe("makeRelative", () => {
  for (const { message, baseUrl, list } of tests) {
    it(message, () => {
      for (const [source, control] of list) {
        expect(makeRelative(baseUrl, source)).toEqual(control);
      }
    });
  }
});
