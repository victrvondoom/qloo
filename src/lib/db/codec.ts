// Compact storage: JSON → brotli. Briefs shrink to roughly a sixth of their JSON size.

import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

export function pack(value: unknown): Uint8Array {
  const json = Buffer.from(JSON.stringify(value), "utf8");
  return new Uint8Array(
    brotliCompressSync(json, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: 7,
        [constants.BROTLI_PARAM_SIZE_HINT]: json.length,
      },
    }),
  );
}

export function unpack<T>(blob: Uint8Array | ArrayBuffer | Buffer): T {
  const bytes = blob instanceof ArrayBuffer ? new Uint8Array(blob) : blob;
  return JSON.parse(brotliDecompressSync(bytes).toString("utf8")) as T;
}
