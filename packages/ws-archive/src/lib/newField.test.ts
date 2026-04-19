import { describe, expect, it } from "vitest";
import { newField } from "./newField.js";

describe("newField", () => {
  it("should get the initial value", () => {
    const field = newField(42);
    expect(field.value).toBe(42);
  });

  it("should set a new value", () => {
    const field = newField(42);
    field.value = 100;
    expect(field.value).toBe(100);
  });

  it("should notify listeners on value change", () => {
    const field = newField(42);
    let notifiedValue = 0;
    const stopListening = field((value) => {
      notifiedValue = value;
    });

    expect(notifiedValue).toBe(42);

    field.value = 100;
    expect(notifiedValue).toBe(100);

    stopListening();
    field.value = 200;
    expect(notifiedValue).toBe(100); // Listener should not be notified after stopping
  });

  it("should allow multiple listeners", () => {
    const field = newField(42);
    let notifiedValue1 = 0;
    let notifiedValue2 = 0;

    const stopListening1 = field((value) => {
      notifiedValue1 = value;
    });

    const stopListening2 = field((value) => {
      notifiedValue2 = value;
    });
    expect(notifiedValue1).toBe(42);
    expect(notifiedValue2).toBe(42);

    field.value = 100;
    expect(notifiedValue1).toBe(100);
    expect(notifiedValue2).toBe(100);

    stopListening1();
    field.value = 200;
    expect(notifiedValue1).toBe(100); // Listener 1 should not be notified after stopping
    expect(notifiedValue2).toBe(200); // Listener 2 should still be notified

    stopListening2();
    field.value = 300;
    expect(notifiedValue2).toBe(200); // Listener 2 should not be notified after stopping
  });

  it("should use custom equality function", () => {
    const equals = (a: { val: number }, b: { val: number }) => a.val === b.val;
    const field = newField({ val: 1 }, equals);
    let notifiedValue = { val: 0 };
    const stopListening = field((value) => {
      notifiedValue = value;
    });

    expect(notifiedValue).toEqual({ val: 1 });

    // Setting the same value according to the custom equality function
    field.value = { val: 1 };
    expect(notifiedValue).toEqual({ val: 1 }); // Listener should not be notified

    // Setting a different value according to the custom equality function
    field.value = { val: 2 };
    expect(notifiedValue).toEqual({ val: 2 }); // Listener should be notified

    stopListening();
  });
});
