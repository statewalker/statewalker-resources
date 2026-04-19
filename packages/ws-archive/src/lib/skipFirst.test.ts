import { describe, expect, it } from "vitest";
import { newField } from "./newField.js";
import { skipFirst } from "./skipFirst.js";

describe("skipFirst", () => {
  it("should skip the first call and react to subsequent changes", () => {
    const field = newField(42);
    const values: number[] = [];

    const listener = skipFirst((value: number) => {
      values.push(value);
    });

    const stopListening = field(listener);
    // The initial value should be skipped

    // Change the value
    field.value = 100; // Should be recorded
    field.value = 200; // Should be recorded
    field.value = 300; // Should be recorded

    expect(values).toEqual([100, 200, 300]);

    // Stop listening for changes
    stopListening();
  });

  it("should skip the first call if the listener is called directly", () => {
    const values: number[] = [];

    const listener = skipFirst((value: number) => {
      values.push(value);
    });

    // Call the listener directly
    listener(100); // Should be skipped
    listener(200); // Should be recorded
    listener(300); // Should be recorded

    expect(values).toEqual([200, 300]);
  });

  it("should work with multiple listeners", () => {
    const field = newField(42);
    const values1: number[] = [];
    const values2: number[] = [];

    const listener1 = skipFirst((value: number) => {
      values1.push(value);
    });

    const listener2 = skipFirst((value: number) => {
      values2.push(value);
    });

    const stopListening1 = field(listener1);
    const stopListening2 = field(listener2);
    // The initial value (42) should be skipped

    // Change the value
    field.value = 100; // Should be recorded
    field.value = 200; // Should be recorded
    field.value = 300; // Should be recorded

    expect(values1).toEqual([100, 200, 300]);
    expect(values2).toEqual([100, 200, 300]);

    // Stop listening for changes
    stopListening1();
    stopListening2();
  });
});
