import { describe, expect, it } from "vitest";
import { resolveUrl } from "../../../src/utils/uris/resolve-url.js";
import tests from "./resolve-url.data.js";

describe("resolveUrl", () => {
  for (const { message, baseUrl, list } of tests) {
    it(message, () => {
      for (const [source, control] of list) {
        expect(resolveUrl(baseUrl, source)).toEqual(control);
      }
    });
  }
});
