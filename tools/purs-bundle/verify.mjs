// Checks a PUBLISHED PureScript bundle: fetches `purs/current.json` under a
// base URL, then the manifest and every file it names, and verifies each file
// against the hash in its name and the sizes the manifest records. Exits 1 on
// any mismatch (so a deploy can stop before publishing).
//
//   node tools/purs-bundle/verify.mjs https://jafonsor.github.io/type-solution/
//   node tools/purs-bundle/verify.mjs --serve site/        # serve a folder locally, check <folder>/purs/
//
// Hashes follow build.mjs: the name carries the first 16 hex digits of the
// sha256 of the content, but for a pack of the UNCOMPRESSED pack (the file is
// gzip; the manifest's `bytes` is the gzip size, `rawBytes` the uncompressed).
import { createHash } from "node:crypto";
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const HASH = /^(.+)\.([0-9a-f]{16})\.([a-z.]+)$/;

// Returns {files, problems}: the names checked and a message per mismatch.
export async function verifyBundle(baseUrl, { fetch: fetcher = fetch, log = () => {} } = {}) {
  const root = new URL("purs/", baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  const problems = [];
  const fail = (m) => problems.push(m);
  const get = async (name) => {
    const url = new URL(name, root);
    let res;
    try { res = await fetcher(url.href, { cache: "no-store" }); } catch (e) { fail(`${name}: request failed (${e.message})`); return null; }
    if (!res.ok) { fail(`${name}: HTTP ${res.status} (${url.href})`); return null; }
    return Buffer.from(await res.arrayBuffer());
  };
  // `bytes` = the file's size as served; `raw` = the bytes the name hashes.
  const check = async (name, { bytes, rawBytes, sha256: full } = {}) => {
    const m = HASH.exec(name);
    if (!m) { fail(`${name}: no content hash in the name`); return null; }
    const body = await get(name);
    if (!body) return null;
    if (bytes !== undefined && body.length !== bytes) fail(`${name}: ${body.length} bytes, manifest says ${bytes}`);
    let content = body;
    if (m[3] === "pack.gz") {
      try { content = gunzipSync(body); } catch (e) { fail(`${name}: not valid gzip (${e.message})`); return body; }
      if (rawBytes !== undefined && content.length !== rawBytes) fail(`${name}: ${content.length} bytes uncompressed, manifest says ${rawBytes}`);
    }
    const hash = sha256(content);
    if (hash.slice(0, 16) !== m[2]) fail(`${name}: content hashes to ${hash.slice(0, 16)}, the name says ${m[2]}`);
    if (full !== undefined && hash !== full) fail(`${name}: sha256 ${hash}, manifest says ${full}`);
    log(`ok ${name}`);
    return body;
  };

  let files = 0;
  const pointerBytes = await get("current.json");
  if (!pointerBytes) return { files, problems };
  let manifestName;
  try { manifestName = JSON.parse(pointerBytes.toString("utf8")).manifest; } catch (e) { fail(`current.json: not JSON (${e.message})`); }
  if (typeof manifestName !== "string") { fail("current.json: no `manifest` name"); return { files, problems }; }
  files++;
  const body = await check(manifestName);
  if (!body) return { files, problems };
  files++;
  let manifest;
  try { manifest = JSON.parse(body.toString("utf8")); } catch (e) { fail(`${manifestName}: not JSON (${e.message})`); return { files, problems }; }
  for (const [what, entry] of Object.entries(manifest.core ?? {})) {
    if (!entry?.file) { fail(`manifest core.${what}: no file`); continue; }
    await check(entry.file, entry); files++;
  }
  for (const [lib, part] of Object.entries(manifest.parts ?? {})) {
    if (!part?.file) { fail(`manifest parts.${lib}: no file`); continue; }
    await check(part.file, part); files++;
  }
  if (files < 4) fail(`only ${files} files named: the manifest looks empty`);
  return { files, problems };
}

const types = { ".json": "application/json", ".wasm": "application/wasm", ".gz": "application/gzip" };
export function serveFolder(dir) {
  const server = http.createServer((q, r) => {
    const file = join(resolve(dir), decodeURIComponent(q.url.split("?")[0]));
    try { if (!statSync(file).isFile()) throw 0; } catch { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(r);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const serve = args[0] === "--serve";
  const target = serve ? args[1] : args[0];
  if (!target) { console.error("usage: verify.mjs <base url> | --serve <site folder>"); process.exit(2); }
  const local = serve ? await serveFolder(target) : null;
  const { files, problems } = await verifyBundle(local ? local.url : target);
  local?.server.close();
  if (problems.length) {
    console.error(problems.map((p) => `FAIL ${p}`).join("\n"));
    console.error(`${problems.length} problem(s) in ${files} files checked`);
    process.exit(1);
  }
  console.log(`purs bundle verified: ${files} files, every hash and size matches`);
}
