/**
 * This method contains the implementation of the SHA1 algorithm copied from [js-sha1](https://github.com/emn178/js-sha1) library (MIT License).
 * If this method is used with parameters - with one or more byte arrays - then it directly returns the resulting hash.
 * If there is no parameters for this method then it returns an update function which can be called multiple times to update the internal digest. The chained "finalize" function returns the resulting hash.
 *
 * ```javascript
 *  const encoder = new TextEncoder();
 *  const token1 = encoder.encode("Hello");
 *  const token2 = encoder.encode(" ");
 *  const token3 = encoder.encode("World");
 *
 *  // Example: 
 *  let sha1 = newSha1()
 *   .update(token1)
 *   .update(token2)
 *   .update(token3)
 *   .finalize();
 * ```
 */
export type Sha1Builder = {
  update: (message: Uint8Array) => Sha1Builder;
  digest: () => number[];
  hex: () => string;
}
export function newSha1(): Sha1Builder {
  /*
   * [js-sha1]{@link https://github.com/emn178/js-sha1}
   *
   * @version 0.6.0
   * @author Chen, Yi-Cyuan [emn178@gmail.com]
   * @copyright Chen, Yi-Cyuan 2014-2017
   * @license MIT
   */

  const EXTRA = [-2147483648, 8388608, 32768, 128];
  const SHIFT = [24, 16, 8, 0];

  const blocks = new Array(17).fill(0) as number[];

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  let block = 0;
  let start = 0;
  let bytes = 0;
  let hBytes = 0;
  let sha1: undefined | number[];
  let hashed = false;

  let lastByteIndex = 0;

  function checkFinalized() {
    if (sha1) { throw new Error("Hash was finalized"); }
  }

  function update(message: undefined | Uint8Array): typeof update {
    if (message === undefined) {
      return update;
    }
    checkFinalized();
    let index = 0;
    let i = 0;
    const length = message.length || 0;

    while (index < length) {
      if (hashed) {
        hashed = false;
        blocks.fill(0);
        blocks[0] = block;
      }

      for (i = start; index < length && i < 64; ++index) {
        blocks[i >> 2] |= message[index] << SHIFT[i++ & 3];
      }

      lastByteIndex = i;
      bytes += i - start;
      if (i >= 64) {
        block = blocks[16];
        start = i - 64;
        hash();
        hashed = true;
      } else {
        start = i;
      }
    }
    if (bytes > 4294967295) {
      hBytes += (bytes / 4294967296) << 0;
      bytes = bytes % 4294967296;
    }
    return update;
  }

  function digest() {
    if (!sha1) {
      const i = lastByteIndex;
      blocks[16] = block;
      blocks[i >> 2] |= EXTRA[i & 3];
      block = blocks[16];
      if (i >= 56) {
        if (!hashed) {
          hash();
        }
        blocks.fill(0);
        blocks[0] = block;
      }
      blocks[14] = (hBytes << 3) | (bytes >>> 29);
      blocks[15] = bytes << 3;
      hash();

      sha1 = [
        (h0 >> 24) & 0xff,
        (h0 >> 16) & 0xff,
        (h0 >> 8) & 0xff,
        h0 & 0xff,
        (h1 >> 24) & 0xff,
        (h1 >> 16) & 0xff,
        (h1 >> 8) & 0xff,
        h1 & 0xff,
        (h2 >> 24) & 0xff,
        (h2 >> 16) & 0xff,
        (h2 >> 8) & 0xff,
        h2 & 0xff,
        (h3 >> 24) & 0xff,
        (h3 >> 16) & 0xff,
        (h3 >> 8) & 0xff,
        h3 & 0xff,
        (h4 >> 24) & 0xff,
        (h4 >> 16) & 0xff,
        (h4 >> 8) & 0xff,
        h4 & 0xff
      ];
    }
    return sha1;
  }

  function hash() {
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f: number;
    let j: number;
    let t: number;

    for (j = 16; j < 80; ++j) {
      t = blocks[j - 3] ^ blocks[j - 8] ^ blocks[j - 14] ^ blocks[j - 16];
      blocks[j] = (t << 1) | (t >>> 31);
    }

    for (j = 0; j < 20; j += 5) {
      f = (b & c) | (~b & d);
      t = (a << 5) | (a >>> 27);
      e = (t + f + e + 1518500249 + blocks[j]) << 0;
      b = (b << 30) | (b >>> 2);

      f = (a & b) | (~a & c);
      t = (e << 5) | (e >>> 27);
      d = (t + f + d + 1518500249 + blocks[j + 1]) << 0;
      a = (a << 30) | (a >>> 2);

      f = (e & a) | (~e & b);
      t = (d << 5) | (d >>> 27);
      c = (t + f + c + 1518500249 + blocks[j + 2]) << 0;
      e = (e << 30) | (e >>> 2);

      f = (d & e) | (~d & a);
      t = (c << 5) | (c >>> 27);
      b = (t + f + b + 1518500249 + blocks[j + 3]) << 0;
      d = (d << 30) | (d >>> 2);

      f = (c & d) | (~c & e);
      t = (b << 5) | (b >>> 27);
      a = (t + f + a + 1518500249 + blocks[j + 4]) << 0;
      c = (c << 30) | (c >>> 2);
    }

    for (; j < 40; j += 5) {
      f = b ^ c ^ d;
      t = (a << 5) | (a >>> 27);
      e = (t + f + e + 1859775393 + blocks[j]) << 0;
      b = (b << 30) | (b >>> 2);

      f = a ^ b ^ c;
      t = (e << 5) | (e >>> 27);
      d = (t + f + d + 1859775393 + blocks[j + 1]) << 0;
      a = (a << 30) | (a >>> 2);

      f = e ^ a ^ b;
      t = (d << 5) | (d >>> 27);
      c = (t + f + c + 1859775393 + blocks[j + 2]) << 0;
      e = (e << 30) | (e >>> 2);

      f = d ^ e ^ a;
      t = (c << 5) | (c >>> 27);
      b = (t + f + b + 1859775393 + blocks[j + 3]) << 0;
      d = (d << 30) | (d >>> 2);

      f = c ^ d ^ e;
      t = (b << 5) | (b >>> 27);
      a = (t + f + a + 1859775393 + blocks[j + 4]) << 0;
      c = (c << 30) | (c >>> 2);
    }

    for (; j < 60; j += 5) {
      f = (b & c) | (b & d) | (c & d);
      t = (a << 5) | (a >>> 27);
      e = (t + f + e - 1894007588 + blocks[j]) << 0;
      b = (b << 30) | (b >>> 2);

      f = (a & b) | (a & c) | (b & c);
      t = (e << 5) | (e >>> 27);
      d = (t + f + d - 1894007588 + blocks[j + 1]) << 0;
      a = (a << 30) | (a >>> 2);

      f = (e & a) | (e & b) | (a & b);
      t = (d << 5) | (d >>> 27);
      c = (t + f + c - 1894007588 + blocks[j + 2]) << 0;
      e = (e << 30) | (e >>> 2);

      f = (d & e) | (d & a) | (e & a);
      t = (c << 5) | (c >>> 27);
      b = (t + f + b - 1894007588 + blocks[j + 3]) << 0;
      d = (d << 30) | (d >>> 2);

      f = (c & d) | (c & e) | (d & e);
      t = (b << 5) | (b >>> 27);
      a = (t + f + a - 1894007588 + blocks[j + 4]) << 0;
      c = (c << 30) | (c >>> 2);
    }

    for (; j < 80; j += 5) {
      f = b ^ c ^ d;
      t = (a << 5) | (a >>> 27);
      e = (t + f + e - 899497514 + blocks[j]) << 0;
      b = (b << 30) | (b >>> 2);

      f = a ^ b ^ c;
      t = (e << 5) | (e >>> 27);
      d = (t + f + d - 899497514 + blocks[j + 1]) << 0;
      a = (a << 30) | (a >>> 2);

      f = e ^ a ^ b;
      t = (d << 5) | (d >>> 27);
      c = (t + f + c - 899497514 + blocks[j + 2]) << 0;
      e = (e << 30) | (e >>> 2);

      f = d ^ e ^ a;
      t = (c << 5) | (c >>> 27);
      b = (t + f + b - 899497514 + blocks[j + 3]) << 0;
      d = (d << 30) | (d >>> 2);

      f = c ^ d ^ e;
      t = (b << 5) | (b >>> 27);
      a = (t + f + a - 899497514 + blocks[j + 4]) << 0;
      c = (c << 30) | (c >>> 2);
    }

    h0 = (h0 + a) << 0;
    h1 = (h1 + b) << 0;
    h2 = (h2 + c) << 0;
    h3 = (h3 + d) << 0;
    h4 = (h4 + e) << 0;
  }

  update.digest = digest;
  update.update = update;
  update.hex = () => toHex(digest());
  return update;
}

export function toHex(array: number[]): string {
  return Array.from(array)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): number[] {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const result: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    result.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return result;
}