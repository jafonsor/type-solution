// Builds the real bundle (needs PURS_WASM and PURS_LIBS, like puzzle-check's
// compiling tests; skipped without them) and checks it.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildBundle, SOURCE_MTIME } from "../build.mjs";
import { gunzipSync } from "node:zlib";
import { readPack } from "../../../static/bundle/pack.mjs";
import { assembleTree, importedModules, librariesFor, sourcesFor } from "../../../static/bundle/purs-tree.mjs";
import { runCompiler } from "../../puzzle-check/purs-runner.js";
import { loadPinned } from "../../puzzle-check/purs-imports.js";
import { languageNamed } from "../../puzzle-check/languages.js";

const have = process.env.PURS_WASM && process.env.PURS_LIBS;
const skip = !have && "set PURS_WASM and PURS_LIBS";
let out, manifest, again;

before(async () => {
  if (!have) return;
  const a = mkdtempSync(join(tmpdir(), "bundle-a-"));
  const b = mkdtempSync(join(tmpdir(), "bundle-b-"));
  const built = await buildBundle({ wasm: process.env.PURS_WASM, libs: process.env.PURS_LIBS, out: a });
  out = a;
  manifest = JSON.parse(readFileSync(join(a, built.manifestFile), "utf8"));
  again = (await buildBundle({ wasm: process.env.PURS_WASM, libs: process.env.PURS_LIBS, out: b })).manifestFile === built.manifestFile ? b : null;
  again ??= "differs";
});

test("every file but current.json has the first 16 hex digits of its content's sha256 in its name", { skip }, () => {
  const files = readdirSync(out).filter((f) => f !== "current.json");
  assert.ok(files.length >= 43);
  for (const f of files) {
    const [, hash] = /\.([0-9a-f]{16})\.[a-z.]+$/.exec(f) ?? [];
    assert.ok(hash, `${f} has no content hash`);
    // A pack's name hashes the uncompressed pack (zlib versions differ); the rest hash the file.
    const bytes = f.endsWith(".pack.gz") ? gunzipSync(readFileSync(join(out, f))) : readFileSync(join(out, f));
    assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 16), hash, f);
  }
  assert.deepEqual(JSON.parse(readFileSync(join(out, "current.json"), "utf8")), { manifest: readdirSync(out).find((f) => f.startsWith("manifest.")) });
});

test("the manifest has exactly the pinned libraries, each with its file, size and requirements", { skip }, () => {
  const pinned = loadPinned(languageNamed("purescript"));
  assert.deepEqual(Object.keys(manifest.parts).sort(), pinned.libraries.map((l) => l.name).sort());
  assert.equal(manifest.packageSet, pinned.packageSet);
  assert.equal(manifest.sourceMtime, SOURCE_MTIME);
  for (const [name, p] of Object.entries(manifest.parts)) {
    assert.equal(readFileSync(join(out, p.file)).length, p.bytes, name);
    assert.ok(!p.requires.includes(name));
    for (const r of p.requires) assert.ok(manifest.parts[r], `${name} requires unknown ${r}`);
  }
  assert.deepEqual(manifest.parts.prelude.requires, []);
  assert.ok(manifest.parts.arrays.requires.includes("prelude"));
  assert.equal(manifest.modules["Data.Array"], "arrays");
  // Prim modules are in no library.
  assert.equal(manifest.modules["Prim.Row"], undefined);
  assert.equal(manifest.core.compiler.sha256, createHash("sha256").update(readFileSync(process.env.PURS_WASM)).digest("hex"));
});

test("a library's pack holds its modules' externs, JavaScript and sources, and nothing of other libraries", { skip }, async () => {
  const p = await readPack(readFileSync(join(out, manifest.parts.arrays.file)));
  const paths = [...p.files.keys()];
  assert.ok(paths.includes("out/Data.Array/externs.cbor"));
  assert.ok(paths.includes("out/Data.Array/index.js"));
  assert.ok(paths.includes("out/Data.Array/foreign.js"));
  assert.ok(paths.includes("lib/arrays/Data/Array.purs"));
  assert.ok(paths.every((x) => x.startsWith("lib/arrays/") || manifest.parts.arrays.modules.some((m) => x.startsWith(`out/${m}/`))));
});

test("the same inputs give the same bytes: same manifest hash on a second build", { skip }, () => {
  assert.notEqual(again, "differs", "the second build's manifest name differs");
  for (const f of readdirSync(out)) assert.equal(readFileSync(join(out, f)).equals(readFileSync(join(again, f))), true, f);
});

test("the names file lists what Data.Array exports", { skip }, () => {
  const names = JSON.parse(readFileSync(join(out, manifest.core.names.file), "utf8"));
  assert.ok(names.modules["Data.Array"].some(([n]) => n === "take"));
  assert.ok(names.preferred.filter);
});

test("the names file lists constructors with their type (ticket 39): Maybe, Either, Tuple", { skip }, () => {
  const { modules, preferred } = JSON.parse(readFileSync(join(out, manifest.core.names.file), "utf8"));
  const rows = (m) => modules[m].map((r) => r.join(":"));
  assert.ok(rows("Data.Maybe").includes("Maybe:data") && rows("Data.Maybe").includes("Just:constructor:Maybe") && rows("Data.Maybe").includes("Nothing:constructor:Maybe"));
  assert.ok(rows("Data.Either").includes("Left:constructor:Either") && rows("Data.Either").includes("Right:constructor:Either"));
  assert.ok(rows("Data.Tuple").includes("Tuple:data") && rows("Data.Tuple").includes("Tuple:constructor:Tuple"));
  assert.ok(rows("Data.Maybe").includes("fromMaybe:value")); // functions are as before
  // a constructor's type is a "data" row in the same module, and every module's constructor names are in 2+ places only when listed
  for (const [m, list] of Object.entries(modules)) {
    for (const [name, kind, type] of list) {
      if (kind === "constructor") assert.ok(list.some(([n, k]) => n === type && k === "data"), `${m}: ${name} has no data row for ${type}`);
    }
  }
  assert.deepEqual(preferred.Pattern, ["Data.String", "Data.List"]);
  assert.deepEqual(preferred.Nil, ["Data.List"]);
});

test("a tree built from only the packs of an import's libraries compiles it without rebuilding any library", { skip }, async () => {
  const code = "module Main where\nimport Prelude\nimport Data.Array (take)\nimport Data.Maybe (Maybe(..))\n\nf :: Array Int -> Array Int\nf xs = take 2 xs\n\ng :: Maybe Int\ng = Nothing\n";
  const libs = librariesFor(manifest, importedModules(code));
  assert.ok(libs.includes("arrays") && libs.includes("maybe") && libs.includes("prelude"));
  assert.ok(!libs.includes("argonaut-core"), "an unrelated library is not in the tree");
  const packs = await Promise.all(libs.map((l) => readPack(readFileSync(join(out, manifest.parts[l].file)))));
  const tree = assembleTree(packs, manifest.sourceMtime);
  const dir = mkdtempSync(join(tmpdir(), "tree-"));
  const when = new Date(manifest.sourceMtime);
  for (const [p, b] of tree.files) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), b);
    utimesSync(join(dir, p), when, when); // every file from a pack: the same mtime
  }
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "out", "package.json"), '{"type":"module"}');
  const module = await WebAssembly.compile(readFileSync(join(out, manifest.core.compiler.file)));
  const narrow = sourcesFor(packs, importedModules(code));
  assert.ok(narrow.length < tree.srcFiles.length && narrow.includes("/w/lib/arrays/Data/Array.purs"), `${narrow.length} of ${tree.srcFiles.length}`);
  const run = runCompiler({ dir, srcFiles: narrow, tick: 0, module }, code);
  assert.equal(run.exit, 0, run.text.slice(0, 500));
  assert.equal([...run.text.matchAll(/Compiling /g)].length, 1, "only Main compiled");
  assert.ok(existsSync(join(dir, "out", "Main", "index.js")));
});
