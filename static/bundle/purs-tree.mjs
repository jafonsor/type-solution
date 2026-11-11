// PureScript: turns decoded packs (see pack.mjs) into the file tree the
// compiler sees at /w, which is what the compiler worker puts in its in-memory
// filesystem.
//
//   lib/<library>/**           library sources (.purs and foreign .js), every
//                              file reporting the manifest's `sourceMtime`
//   out/<Module>/externs.cbor  the compiler's output for the library, plus
//   out/<Module>/index.js      the compiled JavaScript and foreign.js
//   out/cache-db.json          tells the compiler these modules are up to date
//
// Modified times matter (measured): the compiler rebuilds a module whose source
// is newer than its externs, or whose externs are older than a dependency's.
// So EVERY file from a pack (sources, externs, JavaScript) must report the same
// modified time, the manifest's `sourceMtime`; with different ones the
// compiler rebuilds the libraries (3 s for Prelude, 79 s for the arrays closure
// in Node). The caller adds src/Main.purs (with a modified time later than sourceMtime
// and moving with every edit) and passes the compiler `srcFiles`: the
// library .purs files plus Main. Only the packs given are in the tree, so pass
// the closure of the libraries the Solution imports (manifest `requires`).
export function assembleTree(packs, sourceMtime) {
  const files = new Map();
  const cacheDb = {};
  const srcFiles = [];
  for (const { header, files: packFiles } of packs) {
    for (const [path, bytes] of packFiles) files.set(path, bytes);
    for (const m of header.modules) {
      // The compiler tracks the module's .purs and its foreign .js alike.
      cacheDb[m.name] = Object.fromEntries(m.sources.map((s) => ["w/" + s, [sourceMtime, new TextDecoder().decode(packFiles.get(s))]]));
      srcFiles.push(...m.sources.filter((s) => s.endsWith(".purs")).map((s) => "/w/" + s));
    }
  }
  files.set("out/cache-db.json", new TextEncoder().encode(JSON.stringify(cacheDb)));
  return { files, srcFiles: srcFiles.sort() };
}

// The libraries to fetch for a set of imported modules: the libraries that
// hold them and everything those need, from a manifest. Modules that are in no
// library (Prim.*, or unknown) are ignored.
export function librariesFor(manifest, modules) {
  const wanted = new Set();
  for (const m of modules) {
    const lib = manifest.modules[m];
    if (!lib) continue;
    wanted.add(lib);
    for (const r of manifest.parts[lib].requires) wanted.add(r);
  }
  return [...wanted].sort();
}

// The modules a Solution imports, from its text.
export function importedModules(code) {
  return [...code.matchAll(/^import\s+([A-Z][\w.]*)/gm)].map((m) => m[1]);
}

// The .purs files the compiler needs to be given for a Solution: only the
// modules reachable from what it imports (measured: for `import Data.Array`,
// 91 of the 148 modules in its 29 libraries; the compiler parses every file it
// is given on every check, so this cuts the check by about 40%). The tree can
// still hold all the packs' files.
export function sourcesFor(packs, modules) {
  const byName = new Map();
  for (const { header } of packs) for (const m of header.modules) byName.set(m.name, m);
  const seen = new Set();
  const visit = (name) => {
    const m = byName.get(name);
    if (!m || seen.has(name)) return;
    seen.add(name);
    m.imports.forEach(visit);
  };
  modules.forEach(visit);
  return [...seen].flatMap((n) => byName.get(n).sources.filter((s) => s.endsWith(".purs")).map((s) => "/w/" + s)).sort();
}
