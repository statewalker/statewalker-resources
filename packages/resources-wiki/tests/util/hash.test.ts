import { describe, expect, it } from "vitest";
import { hashStream, sha256Hex } from "../../src/util/hash.js";

const enc = (s: string) => new TextEncoder().encode(s);

async function* stream(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield enc(p);
}

describe("hash util", () => {
  it("computes the canonical SHA-256 of a known vector", async () => {
    expect(await sha256Hex(enc("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashStream is chunk-independent and reports the byte count", async () => {
    const whole = await hashStream(stream("hello world"));
    const split = await hashStream(stream("hello", " ", "world"));
    expect(whole.hash).toBe(split.hash);
    expect(whole.bytes).toBe(11);
    // Same digest as hashing the joined bytes directly.
    expect(whole.hash).toBe(await sha256Hex(enc("hello world")));
  });

  it("distinguishes different content", async () => {
    expect((await hashStream(stream("Acme."))).hash).not.toBe(
      (await hashStream(stream("Globex."))).hash,
    );
  });
});
