import { default as expect } from "expect.js";
import { newReference } from "../../src/utils/references.js";

describe("newReference", () => {

  it(`should return the same value for multiple calls`, async () => {
     let obj, counter = 0;
    const ref = newReference([], () => {
      counter++;
      return obj = {};
    });
    expect(obj).to.be(undefined);
    expect(counter).to.be(0);
    let test = ref();
    expect(counter).to.be(1);
    expect(typeof obj).to.be("object");
    expect(typeof test).to.be("object");
    expect(test).to.be(obj);

    // Check that the creation method is not called when we call the reference:
    const savedObj = obj;
    expect(ref()).to.be(savedObj);
    expect(counter).to.be(1);

    expect(ref()).to.be(savedObj);
    expect(counter).to.be(1);

    expect(ref()).to.be(savedObj);
    expect(counter).to.be(1);
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
