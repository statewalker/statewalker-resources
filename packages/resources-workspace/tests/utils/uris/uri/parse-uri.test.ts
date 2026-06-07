import { describe, expect, it } from "vitest";
import { parseUri } from "../../../../src/utils/uris/uri.js";
import tests from "./parse-uri.data.js";

describe("parseUri", () => {
  for (const { message, input, control } of tests) {
    it(message, () => {
      expect(parseUri(input[0])).toEqual(control);
    });
  }
});
