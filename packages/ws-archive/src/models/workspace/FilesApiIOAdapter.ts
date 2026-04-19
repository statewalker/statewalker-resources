import { fromReadableStream } from "../../lib/agen/fromReadableStream.js";
import { toLines } from "../../lib/agen/toLines.js";
import { toReadableStream } from "../../lib/agen/toReadableStream.js";
import { getAdapter } from "../../lib/newAdapter.js";
import { newSha1 } from "../../lib/sha1.js";
import type { FilesApi } from "./FilesApi.js";


export function normalizePath(...paths: string[]): string {
  const filteredSegments: string[] = [];
  for (const path of paths) {
    const segments = path.split(/[\/\\]/gim);
    for (let segment of segments) {
      segment = segment.trim();
      if (segment === "." || segment.length === 0) {
        continue;
      }
      if (segment === "..") {
        if (filteredSegments.length > 0) {
          filteredSegments.pop();
        }
        continue;
      }
      filteredSegments.push(segment);
    }
  }
  filteredSegments.unshift("");
  return filteredSegments.join("/");
}
export interface FilesApiWithPath {
  filesApi: FilesApi;
  basePath?: string;
}
export class FilesApiIOAdapter implements FilesApiWithPath {
  static get: (adaptable: FilesApiWithPath) => FilesApiIOAdapter;
  static remove: (adaptable: FilesApiWithPath) => void;
  static {
    [FilesApiIOAdapter.get, FilesApiIOAdapter.remove] = getAdapter<
      FilesApiIOAdapter,
      FilesApiWithPath
    >("adapter.filesApi.io", ({ filesApi, basePath = "" }) => {
      return new FilesApiIOAdapter(filesApi, basePath);
    });
  }

  filesApi: FilesApi;
  basePath: string;

  constructor(filesApi: FilesApi, basePath = "") {
    this.filesApi = filesApi;
    this.basePath = basePath;
  }

  async fileExists(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);
    const stat = await this.filesApi.stats(fullPath);
    return stat !== null && stat.kind === "file";
  }

  getFullPath(path: string): string {
    return this.normalizePath(this.basePath, path);
  }

  normalizePath(...paths: string[]): string {
    return normalizePath(...paths);
  }

  async getSha1(path: string): Promise<string> {
    const sha1 = newSha1();
    for await (const block of this.read(path)) {
      sha1.update(block);
    }
    return sha1.hex();
  }

  // --------------------------------------------------------

  async *toDataIterator(
    data:
      | Uint8Array
      | Blob
      | string
      | Iterable<Uint8Array | Blob | string>
      | AsyncIterable<Uint8Array | Blob | string>,
  ): AsyncIterable<Uint8Array> {
    let encoder: TextEncoder | undefined;
    const toBytes = async (
      data: Uint8Array | Blob | string,
    ): Promise<Uint8Array> => {
      let bytes: Uint8Array;
      if (typeof data === "string") {
        encoder = encoder || new TextEncoder();
        bytes = encoder.encode(data);
      } else if (data instanceof Blob) {
        bytes = await data.bytes();
      } else {
        bytes = data;
      }
      return bytes;
    };

    const input: AsyncIterable<Uint8Array> = (async function* () {
      if (typeof data === "string") {
        yield await toBytes(data);
      } else if (data instanceof Blob || data instanceof Uint8Array) {
        yield await toBytes(data);
      } else if (Symbol.iterator in data || Symbol.asyncIterator in data) {
        for await (const chunk of data) {
          yield await toBytes(chunk as Uint8Array | Blob | string);
        }
      } else {
        yield await toBytes(data);
      }
    })();
    yield* input;
  }

  // --------------------------------------------------------
  // Data blocks

  async toDataFromIterator(
    input: AsyncIterable<Uint8Array>,
  ): Promise<Uint8Array> {
    const blocks: Uint8Array[] = [];
    for await (const block of input) {
      blocks.push(block);
    }
    const arrayBuffer = await new Blob(blocks as BlobPart[]).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async *toIteratorFromData<T>(
    data: T | Iterable<T> | AsyncIterable<T>,
  ): AsyncIterable<T> {
    if (isIterable(data)) {
      for await (const chunk of data) {
        yield chunk;
      }
    } else {
      yield data as T;
    }
    function isIterable<T>(data: unknown): data is AsyncIterable<T> {
      return (typeof data === "object") && (data !== null) && (Symbol.iterator in (data as object));
    }
  }

  // --------------------------------------------------------
  // Read / Write

  async *read(path: string): AsyncGenerator<Uint8Array> {
    const fullPath = this.getFullPath(path);
    const dataBlocks = this.filesApi.read(fullPath);
    yield* dataBlocks;
  }

  async write(path: string, input: AsyncIterable<Uint8Array>) {
    const fullPath = this.getFullPath(path);
    return await this.filesApi.write(fullPath, input);
  }

  async remove(path: string): Promise<boolean> {
    const fullPath = this.getFullPath(path);
    return await this.filesApi.remove(fullPath);
  }

  // --------------------------------------------------------
  // ReadableStream

  async *fromReadableStream<T>(stream: ReadableStream<T>) {
    yield* fromReadableStream<T>(stream);
  }

  toReadableStream<T>(input: AsyncIterable<T>): ReadableStream<T> {
    return toReadableStream(input);
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
    const fullPath = this.getFullPath(path);
    const input = this.fromReadableStream(stream);
    return await this.filesApi.write(fullPath, input);
  }

  readStream(path: string): ReadableStream<Uint8Array> {
    const dataBlocks = this.read(path);
    const stream = this.toReadableStream<Uint8Array>(dataBlocks);
    return stream;
  }

  // --------------------------------------------------------
  // Deflate / Inflate

  async *decompresse(
    input: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<Uint8Array> {
    const readableStream = toReadableStream(input);
    const decompressedStream = readableStream.pipeThrough(
      new DecompressionStream("gzip"),
    );
    yield* fromReadableStream(decompressedStream);
  }

  async *compresse(
    input: AsyncIterable<Uint8Array>,
  ): AsyncGenerator<Uint8Array> {
    const readableStream = toReadableStream(input);
    const compressedStream = readableStream.pipeThrough(
      new CompressionStream("gzip"),
    );
    yield* fromReadableStream(compressedStream);
  }

  // --------------------------------------------------------
  // Text: from / to

  async *decode(input: AsyncIterable<Uint8Array>): AsyncIterable<string> {
    const decoder = new TextDecoder();
    for await (const chunk of input) {
      yield decoder.decode(chunk);
    }
  }

  async *encode(input: AsyncIterable<string>): AsyncIterable<Uint8Array> {
    const encoder = new TextEncoder();
    for await (const chunk of input) {
      yield encoder.encode(chunk);
    }
  }

  async *toLines(input: AsyncIterable<string>): AsyncIterable<string> {
    const lines = toLines(input);
    yield* lines;
  }

  async toText(input: AsyncIterable<string>): Promise<string> {
    const textChunks: string[] = [];
    for await (const chunk of input) {
      textChunks.push(chunk);
    }
    return textChunks.join("");
  }

  async *fromText(
    content: string | Iterable<string> | AsyncIterable<string>,
  ): AsyncIterable<string> {
    yield* this.toIteratorFromData<string>(content);
  }

  async readText(path: string): Promise<string> {
    const input = this.read(path);
    const textChunks = this.decode(input);
    return this.toText(textChunks);
  }

  async writeText(
    path: string,
    data: string | Generator<string> | AsyncGenerator<string>,
    replacer?: (number | string)[] | null,
    space?: string | number,
  ): Promise<Record<string, unknown>> {
    const input = this.fromText(data);
    const encoded = this.encode(input);
    return await this.write(path, encoded);
  }

  // --------------------------------------------------------
  // JSON

  async toJson<T = Record<string, unknown>>(
    input: AsyncIterable<string>,
  ): Promise<T> {
    const text = await this.toText(input);
    return JSON.parse(text) as T;
  }

  async *fromJson<T>(
    data: T,
    replacer?: (number | string)[] | null,
    space?: string | number,
  ) {
    yield JSON.stringify(data, replacer, space);
  }

  async readJson<T>(path: string): Promise<T> {
    const input = this.read(path);
    const textChunks = this.decode(input);
    return this.toJson<T>(textChunks);
  }

  async writeJson<T>(
    path: string,
    data: T,
    replacer?: (number | string)[] | null,
    space?: string | number,
  ): Promise<Record<string, unknown>> {
    const input = this.fromJson(data, replacer, space);
    const encoded = this.encode(input);
    return await this.write(path, encoded);
  }
}
