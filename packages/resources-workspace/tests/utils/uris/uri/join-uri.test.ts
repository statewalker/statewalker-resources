import { describe, expect, it } from "vitest";
import { joinUri, parseUri } from "../../../../src/utils/uris/uri.js";
import tests from "./join-uri.data.js";

describe("joinUri", () => {
  for (const { message, input, control } of tests) {
    it(message, () => {
      const parsed = input.map((u) => parseUri(u));
      expect(joinUri(...parsed)).toEqual(control);
    });
  }
});
