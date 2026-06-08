/**
 * Content hashing for change-detection — portable Web Crypto (`globalThis.crypto`),
 * no Node imports, so it runs unchanged in the browser and at the CLI boundary.
 */

/** SHA-256 hex digest of a byte buffer. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const b of view) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Drain a FilesApi byte stream into the SHA-256 hex digest of its bytes plus the byte count. */
export async function hashStream(
  stream: AsyncIterable<Uint8Array>,
): Promise<{ hash: string; bytes: number }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const buf = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return { hash: await sha256Hex(buf), bytes: total };
}
