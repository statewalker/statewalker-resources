import { validate } from "@statewalker/fsm-validator";
import { describe, expect, it } from "vitest";
import { QUERY_FSM } from "../../src/query/fsm/query-fsm.js";

describe("QUERY_FSM definition — validator gate", () => {
  it("passes @statewalker/fsm-validator with 0 errors and 0 warnings", () => {
    const result = validate(QUERY_FSM as unknown as Parameters<typeof validate>[0]);
    const fmt = (xs: typeof result.errors) =>
      xs.map((i) => `[${i.rule}] ${i.path.join(">")}: ${i.message}`).join("\n");
    expect(fmt(result.errors), "errors").toBe("");
    expect(fmt(result.warnings), "warnings").toBe("");
    expect(result.valid).toBe(true);
  });
});
