import { describe, expect, it } from "vitest";
import { hashCodeForNumbers, hashCodeForString } from "./hash.js";

describe("hash", () => {

  it("should generate unique hashes for numbers", async () => {
    const hash1 = hashCodeForNumbers([1, 2, 3]);
    const hash2 = hashCodeForNumbers([4, 5, 6]);
    expect(hash1).not.toEqual(hash2);
    expect(hashCodeForNumbers([45, 56, 67, 78, 89])).toBe(hashCodeForNumbers([45, 56, 67, 78, 89]));
    expect(hashCodeForNumbers([45, -56, 67, -78, 89])).toBe(hashCodeForNumbers([45, -56, 67, -78, 89]));
  });

  it("should generate unique hashes for strings", async () => {
    const hash1 = hashCodeForString("hello");
    const hash2 = hashCodeForString("world");
    expect(hash1).not.toEqual(hash2);
    expect(hashCodeForString("hello")).toBe(hashCodeForString("hello"));
    expect(hashCodeForString("hello")).not.toEqual(hashCodeForString("Hello"));
  });
});
