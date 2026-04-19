import { describe, expect, it } from "vitest";
import { newValue } from "./newValue.js";

describe("newValue", () => {
  it("should get the initial value", () => {
    const [get] = newValue(42);
    expect(get()).toBe(42);
  });

  it("should set a new value", () => {
    const [get, set] = newValue(42);
    set(100);
    expect(get()).toBe(100);
  });

  it("should not set the same value", () => {
    const [get, set] = newValue(42);
    set(42);
    expect(get()).toBe(42);
  });

  it("should notify listeners on value change", () => {
    const [get, set, listen] = newValue(42);
    let notifiedValue = 0;
    const stopListening = listen((value) => {
      notifiedValue = value;
    });

    set(100);
    expect(notifiedValue).toBe(100);

    stopListening();
    set(200);
    expect(notifiedValue).toBe(100); // Listener should not be notified after stopping
    expect(get()).toBe(200);
  });

  it("should use custom equality function", () => {
    const [get, set] = newValue({ a: 1, stamp: 123 }, (a, b) => a.a === b.a);
    // No changes applied because the equality function only compares the 'a' property
    set({ a: 1, stamp: 456 });
    expect(get()).toEqual({ a: 1, stamp: 123 });

    set({ a: 2, stamp: 789 });
    expect(get()).toEqual({ a: 2, stamp: 789 });
  });
});
