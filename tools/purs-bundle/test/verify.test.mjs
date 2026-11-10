// The verifier passes on a real built bundle and fails when one byte of a
// pack, the manifest or the pointer changes, or a file is missing. Needs
// PURS_WASM and PURS_LIBS (builds the bundle), like build.test.mjs.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBundle } from "../build.mjs";
import { serveFolder, verifyBundle } from "../verify.mjs";

const have = process.env.PURS_WASM && process.env.PURS_LIBS;
const skip = !have && "set PURS_WASM and PURS_LIBS";
let built, manifestFile, manifest;

before(async () => {
  if (!have) return;
  built = mkdtempSync(join(tmpdir(), "verify-built-"));
  manifestFile = (await buildBundle({ wasm: process.env.PURS_WASM, libs: process.env.PURS_LIBS, out: built })).manifestFile;
  manifest = JSON.parse(readFileSync(join(built, manifestFile), "utf8"));
});

// A site folder holding a copy of the bundle under purs/, changed by `edit`,
// verified over HTTP under a sub-path like Pages' /type-solution/.
async function run(edit = () => {}) {
  const site = mkdtempSync(join(tmpdir(), "verify-site-"));
  mkdirSync(join(site, "type-solution"));
  cpSync(built, join(site, "type-solution/purs"), { recursive: true });
  edit(join(site, "type-solution/purs"));
  const { server, url } = await serveFolder(site);
  try { return await verifyBundle(url + "type-solution/"); } finally { server.close(); rmSync(site, { recursive: true }); }
}
const flip = (file) => { chmodSync(file, 0o644); const b = readFileSync(file); b[Math.floor(b.length / 2)] ^= 1; writeFileSync(file, b); };

test("passes on a real built bundle", { skip }, async () => {
  const { files, problems } = await run();
  assert.deepEqual(problems, []);
  assert.equal(files, 2 + Object.keys(manifest.core).length + Object.keys(manifest.parts).length);
});

test("fails when one byte of a pack changes", { skip }, async () => {
  const pack = manifest.parts.arrays.file;
  const { problems } = await run((d) => flip(join(d, pack)));
  assert.ok(problems.length > 0 && problems.some((p) => p.startsWith(pack)), problems.join("\n"));
});

test("fails when one byte of the compiler or the name table changes", { skip }, async () => {
  for (const f of [manifest.core.compiler.file, manifest.core.names.file]) {
    const { problems } = await run((d) => flip(join(d, f)));
    assert.ok(problems.some((p) => p.startsWith(f)), `${f}: ${problems.join("\n")}`);
  }
});

test("fails when one byte of the manifest changes", { skip }, async () => {
  const { problems } = await run((d) => flip(join(d, manifestFile)));
  assert.ok(problems.some((p) => p.startsWith(manifestFile)), problems.join("\n"));
});

test("fails when the pointer names another manifest or is broken", { skip }, async () => {
  const other = manifestFile.replace(/\.[0-9a-f]{16}\./, ".0000000000000000.");
  let r = await run((d) => writeFileSync(join(d, "current.json"), JSON.stringify({ manifest: other })));
  assert.ok(r.problems.length > 0);
  r = await run((d) => flip(join(d, "current.json")));
  assert.ok(r.problems.length > 0);
});

test("fails when a file is missing", { skip }, async () => {
  const pack = manifest.parts.prelude.file;
  const { problems } = await run((d) => rmSync(join(d, pack)));
  assert.ok(problems.some((p) => p.startsWith(pack) && p.includes("404")), problems.join("\n"));
  const r = await run((d) => rmSync(join(d, "current.json")));
  assert.ok(r.problems.length > 0);
});

test("fails when the bundle is not there at all", async () => {
  const site = mkdtempSync(join(tmpdir(), "verify-empty-"));
  const { server, url } = await serveFolder(site);
  try { assert.ok((await verifyBundle(url)).problems.length > 0); } finally { server.close(); }
});
