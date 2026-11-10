// The file format of one part of a lazy-loaded Language bundle (a "pack"):
// several files in one gzip-compressed file, so a library is one request.
//
//   gzip( u32 little-endian header length | header JSON (UTF-8) | file bytes... )
//
// The header is {format: 1, name, files: [{path, size}], ...extra}; the file
// bytes follow in the order of `files`. `extra` is whatever the Language's
// build wants to tell its worker (the PureScript build adds `modules`).
// Compressed by us, not by the server: GitHub Pages compresses by file type and
// we do not want the size to depend on that.
//
// Browser-safe (Web APIs only); the build (tools/purs-bundle/) imports the
// encoder, the app the decoder.

const FORMAT = 1;

export function encodePack(header, files) {
  const head = new TextEncoder().encode(
    JSON.stringify({ ...header, format: FORMAT, files: files.map((f) => ({ path: f.path, size: f.bytes.length })) }),
  );
  const out = new Uint8Array(4 + head.length + files.reduce((n, f) => n + f.bytes.length, 0));
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  let at = 4 + head.length;
  for (const f of files) {
    out.set(f.bytes, at);
    at += f.bytes.length;
  }
  return out;
}

// -> {header, files: Map path -> Uint8Array} from the bytes encodePack made.
export function decodePack(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headLength)));
  if (header.format !== FORMAT) throw new Error(`unknown pack format ${header.format}`);
  const files = new Map();
  let at = 4 + headLength;
  for (const f of header.files) {
    files.set(f.path, bytes.subarray(at, at + f.size));
    at += f.size;
  }
  if (at !== bytes.length) throw new Error("the pack is shorter or longer than its header says");
  return { header, files };
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const gunzip = (bytes) => pipe(bytes, new DecompressionStream("gzip"));

// The file as it is served: -> decoded pack.
export async function readPack(gzipped) {
  return decodePack(await gunzip(gzipped));
}
