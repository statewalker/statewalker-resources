import { describe, expect, it } from "vitest";
import { newValue } from "./newValue.js";
import { composeList, composeValues } from "./newValueCompose.js";

describe("composeValues", () => {
  it("should combine multiple values listeners", () => {
    const [, setA, listenA] = newValue(1);
    const [, setB, listenB] = newValue(2);

    let values: Record<string, number> = {};
    const cleanup = composeValues((vals) => (values = vals), {
      a: listenA,
      b: listenB,
    });
    // The initial values
    expect(values).toEqual({ a: 1, b: 2 });

    // Update the first value
    setA(10);
    expect(values).toEqual({ a: 10, b: 2 });

    // Update the second value
    setB(20);
    expect(values).toEqual({ a: 10, b: 20 });

    cleanup();

    // Update takes no effect after cleanup
    setA(100);
    setB(200);
    // No changes
    expect(values).toEqual({ a: 10, b: 20 });
  });
});

describe("composeList", () => {
  it("should combine multiple values listeners", () => {
    const [, setA, listenA] = newValue(1);
    const [, setB, listenB] = newValue("A");

    let values = [-1, ""];
    const cleanup = composeList<[number, string]>(
      (...vals) => (values = vals),
      listenA,
      listenB,
    );
    // The initial values
    expect(values).toEqual([1, "A"]);

    // Update the first value
    setA(10);
    expect(values).toEqual([10, "A"]);

    // Update the second value
    setB("B");
    expect(values).toEqual([10, "B"]);

    cleanup();

    // Update takes no effect after cleanup
    setA(100);
    setB("C");
    // No changes
    expect(values).toEqual([10, "B"]);
  });
});
