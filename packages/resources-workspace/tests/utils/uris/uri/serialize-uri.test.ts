import { describe, expect, it } from "vitest";
import { serializeUri, type Uri } from "../../../../src/utils/uris/uri.js";
import tests from "./serialize-uri.data.js";

describe("serializeUri", () => {
  for (const { message, input, control } of tests) {
    it(message, () => {
      expect(serializeUri(input[0] as Uri)).toEqual(control);
    });
  }
});
