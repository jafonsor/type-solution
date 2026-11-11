// Builds the PureScript compiler bundle from the pinned library list and the
// released purs-core.wasm:
//
//   node tools/purs-bundle/build.mjs --wasm purs-core.wasm --libs <folder of checkouts> --out <dir>
//
// Output (every file but current.json has a content hash in its name):
//   purs-core.<hash>.wasm        the compiler, as released
//   <library>.<hash>.pack.gz     (hash of the uncompressed pack) one pack per library: its sources, its modules'
//                                externs.cbor, compiled index.js / foreign.js
//   names.<hash>.json            module -> exported names (for the import popup)
//   manifest.<hash>.json         what is what, and which libraries each needs
//   current.json                 {"manifest": "manifest.<hash>.json"}: the one
//                                fixed name; fetch it with cache: "no-cache"
// The compiler is driven the way tools/puzzle-check does (purs-runner.js).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { languageNamed } from "../puzzle-check/languages.js";
import { loadPinned } from "../puzzle-check/purs-imports.js";
import { exportsOf, nameRows, readLibraries } from "../puzzle-check/purs-exports.js";
import { openSession, runCompiler, stripAnsi } from "../puzzle-check/purs-runner.js";
import { encodePack } from "../../static/bundle/pack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// Every library source gets this modified time, so the compiler's cache-db is
// the same on every build and the browser's file tree can report it back.
export const SOURCE_MTIME = "2000-01-01T00:00:00Z";
const HASH_LENGTH = 16;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
// The name carries the hash of the content. A pack is gzip-compressed, and
// different zlib versions compress to different bytes, so its name hashes the
// uncompressed pack: the same content keeps its name (and its cached copy)
// whichever Node built it.
const hashed = (name, ext, bytes) => `${name}.${sha256(bytes).slice(0, HASH_LENGTH)}.${ext}`;
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// Libraries a library needs, transitively, from the imports in its sources.
export function requiresOf(libs, pinned) {
  const direct = new Map(pinned.libraries.map((l) => [l.name, new Set()]));
  for (const { library, parsed } of libs.modules.values()) {
    for (const imp of parsed.imports) {
      const other = pinned.libraryOf.get(imp);
      if (other && other !== library) direct.get(library)?.add(other);
    }
  }
  const closure = (name, seen = new Set()) => {
    for (const d of direct.get(name) ?? []) if (!seen.has(d)) { seen.add(d); closure(d, seen); }
    return seen;
  };
  return new Map([...direct.keys()].map((n) => [n, [...closure(n)].sort()]));
}

export async function buildBundle({ wasm, libs, out, log = () => {} }) {
  const language = languageNamed("purescript");
  const pinned = loadPinned(language);
  mkdirSync(out, { recursive: true });
  if (readdirSync(out).length > 0) throw new Error(`${out} is not empty`);
  const wasmBytes = readFileSync(wasm);

  const session = await openSession(resolve(wasm), resolve(libs));
  const when = new Date(SOURCE_MTIME);
  for (const f of walk(join(session.dir, "lib"))) utimesSync(f, when, when);
  log("compiling the pinned libraries");
  const run = runCompiler(session, "module Main where\n");
  if (run.exit !== 0) throw new Error("the libraries do not compile:\n" + stripAnsi(run.text).slice(-2000));

  const cacheDb = JSON.parse(readFileSync(join(session.dir, "out", "cache-db.json"), "utf8"));
  const sources = readLibraries(libs, pinned.libraries.map((l) => l.name));
  const requires = requiresOf(sources, pinned);

  const manifest = {
    format: 1,
    packageSet: pinned.packageSet,
    compilerVersion: pinned.compiler,
    sourceMtime: SOURCE_MTIME,
    core: {},
    parts: {},
    modules: {},
  };
  const wasmFile = hashed("purs-core", "wasm", wasmBytes);
  copyFileSync(wasm, join(out, wasmFile));
  manifest.core.compiler = { file: wasmFile, bytes: wasmBytes.length, sha256: sha256(wasmBytes) };

  for (const lib of pinned.libraries) {
    const files = [];
    const root = join(session.dir, "lib", lib.name);
    for (const f of walk(root).sort()) files.push({ path: `lib/${lib.name}/${relative(root, f).split("\\").join("/")}`, bytes: readFileSync(f) });
    const modules = [];
    for (const [module, entries] of Object.entries(cacheDb)) {
      const paths = Object.keys(entries);
      if (module === "Main" || !paths.every((p) => p.startsWith(`w/lib/${lib.name}/`))) continue;
      const dir = join(session.dir, "out", module);
      for (const name of ["externs.cbor", "index.js", "foreign.js"]) {
        if (existsSync(join(dir, name))) files.push({ path: `out/${module}/${name}`, bytes: readFileSync(join(dir, name)) });
      }
      modules.push({ name: module, sources: paths.map((p) => p.slice(2)).sort(), imports: [...new Set(sources.modules.get(module)?.parsed.imports ?? [])].sort() });
      manifest.modules[module] = lib.name;
    }
    modules.sort((a, b) => (a.name < b.name ? -1 : 1));
    const raw = encodePack({ name: lib.name, version: lib.version, modules }, files);
    const gz = gzipSync(raw, { level: 9 });
    const file = hashed(lib.name, "pack.gz", raw);
    writeFileSync(join(out, file), gz);
    manifest.parts[lib.name] = { version: lib.version, file, bytes: gz.length, rawBytes: raw.length, requires: requires.get(lib.name), modules: modules.map((m) => m.name) };
    log(`${lib.name}: ${modules.length} modules, ${raw.length} bytes, ${gz.length} gzipped`);
  }
  const unknown = Object.keys(cacheDb).filter((m) => m !== "Main" && !manifest.modules[m]);
  if (unknown.length > 0) throw new Error(`modules compiled but in no pinned library: ${unknown.join(", ")}`);

  // The name table: module -> [[name, kind]], read from the library sources.
  const names = { packageSet: pinned.packageSet, modules: {}, preferred: JSON.parse(readFileSync(join(language.dir, language.config.nameClashes), "utf8")).preferred };
  for (const module of Object.keys(manifest.modules).sort()) {
    const exported = exportsOf(sources, module);
    if (exported) names.modules[module] = nameRows(exported).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  const namesBytes = Buffer.from(JSON.stringify(names));
  const namesFile = hashed("names", "json", namesBytes);
  writeFileSync(join(out, namesFile), namesBytes);
  manifest.core.names = { file: namesFile, bytes: namesBytes.length };

  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 1) + "\n");
  const manifestFile = hashed("manifest", "json", manifestBytes);
  writeFileSync(join(out, manifestFile), manifestBytes);
  writeFileSync(join(out, "current.json"), JSON.stringify({ manifest: manifestFile }) + "\n");
  return { manifestFile, manifest };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [wasm, libs, out] = [arg("wasm") ?? process.env.PURS_WASM, arg("libs") ?? process.env.PURS_LIBS, arg("out")];
  if (!wasm || !libs || !out) {
    console.error("usage: build.mjs --wasm purs-core.wasm --libs <checkouts> --out <dir>  (PURS_WASM and PURS_LIBS also work)");
    process.exit(2);
  }
  const { manifestFile } = await buildBundle({ wasm, libs, out, log: (m) => console.error(m) });
  console.log(manifestFile);
}
