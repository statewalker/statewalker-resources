import { describe, expect, it } from "vitest";
import { parseUri, resolveUri } from "../../../../src/utils/uris/uri.js";
import tests from "./resolve-uri.data.js";

describe("resolveUri", () => {
  for (const { message, input, control } of tests) {
    it(message, () => {
      const [from, to] = input.map((u) => parseUri(u));
      expect(resolveUri(from, to)).toEqual(control);
    });
  }
});
