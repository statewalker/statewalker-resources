import { describe, expect, it } from "../deps.ts";

import { newReference } from "@/utils/references.ts";

describe("newReference", () => {

  it(`should return the same value for multiple calls`, async () => {
     let obj, counter = 0;
    const ref = newReference([], () => {
      counter++;
      return obj = {};
    });
    expect(obj).toBe(undefined);
    expect(counter).toBe(0);
    const test = ref();
    expect(counter).toBe(1);
    expect(typeof obj).toBe("object");
    expect(typeof test).toBe("object");
    expect(test).toBe(obj);

    // Check that the creation method is not called when we call the reference:
    const savedObj = obj;
    expect(ref()).toBe(savedObj);
    expect(counter).toBe(1);

    expect(ref()).toBe(savedObj);
    expect(counter).toBe(1);

    expect(ref()).toBe(savedObj);
    expect(counter).toBe(1);
  });

  it(`should be able to refresh referenced values after dependencies invalidation`, async () => {
    let counter = 0;
    const first = newReference([], () => {
      return { id: counter++, message: "First" };
    });
    const second = newReference([], () => {
      return { id: counter++, message: "Second" };
    });
    const third = newReference([first, second], (first, second) => {
      return {
        id: counter++,
        message: "Third",
        first,
        second,
      };
    });

    expect(third()).to.eql({
      id: 2,
      message: "Third",
      first: {
        id: 0,
        message: "First",
      },
      second: {
        id: 1,
        message: "Second",
      },
    });
    
    // Reset the reference and check that dependencies are re-loaded as well:
    second.reset();
    expect(second()).to.eql({
      id : 3,
      message: "Second"
    })

    expect(third()).to.eql({
      id: 4,
      message: "Third",
      first: {
        id: 0,
        message: "First",
      },
      second: {
        id: 3,
        message: "Second",
      },
    });

  });
});
