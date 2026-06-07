import { describe, expect, it } from "vitest";
import { makeRelativeUri, parseUri } from "../../../../src/utils/uris/uri.js";
import tests from "./make-relative-uri.data.js";

describe("makeRelativeUri", () => {
  for (const { message, input, control } of tests) {
    it(message, () => {
      const [from, to] = input.map((u) => parseUri(u));
      expect(makeRelativeUri(from, to)).toEqual(control);
    });
  }
});
