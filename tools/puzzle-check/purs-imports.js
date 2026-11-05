// The PureScript import check, which needs no compiler:
//   1. every import is one line: `import M (a, b)` (no qualified, hiding, as,
//      no wrapped lines);
//   2. the module is in a library on the committed pinned list
//      (languages/purescript/packages.json), or is built in (`Prim.*`);
//   3. when the library sources are at hand (PURS_LIBS, a folder of checkouts
//      `<library>/src/**/*.purs`), every imported name is exported by the
//      module it is imported from. Without the sources step 3 is skipped and
//      the result says so; steps 1 and 2 need only the committed file.
//
// Library sources are not committed. PURS_LIBS only says where they are; the
// pinned list says which libraries they must be.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { importNameProblems, parseImportLine, readLibraries } from "./purs-exports.js";

const primModule = /^Prim(\.|$)/;
const oneLineImport = /^import\s+([A-Z][\w.]*)(\s*\([^()]*(\([^()]*\)[^()]*)*\))?\s*$/;

const pinnedCache = new Map();
// The committed list: {packageSet, libraries: [{name, version, commit, repo,
// modules}], libraryOf: Map module -> library name}.
export function loadPinned(language) {
  const file = join(language.dir, language.config.imports.pinnedList);
  if (!pinnedCache.has(file)) {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const libraryOf = new Map();
    for (const lib of doc.libraries) for (const m of lib.modules) libraryOf.set(m, lib.name);
    pinnedCache.set(file, { ...doc, libraryOf });
  }
  return pinnedCache.get(file);
}

// Where the library sources are: the override if given, else PURS_LIBS; null
// if neither names a folder.
export function libsFolder(override) {
  const path = override ?? process.env.PURS_LIBS;
  return path && existsSync(path) && statSync(path).isDirectory() ? path : null;
}

const libsCache = new Map();
// The pinned libraries' sources found in `folder`: {libs, missing: [library
// names on the list but not in the folder]}.
export function openLibraries(folder, pinned) {
  const key = `${folder}\0${pinned.packageSet}\0${pinned.libraries.length}`;
  if (!libsCache.has(key)) {
    const names = pinned.libraries.map((l) => l.name);
    const libs = readLibraries(folder, names);
    const present = new Set([...libs.modules.values()].map((m) => m.library));
    libsCache.set(key, { libs, missing: names.filter((n) => !present.has(n)) });
  }
  return libsCache.get(key);
}

// The modules the committed list gives for a library against the modules found
// in the sources: [problem]. Used to notice the list going stale.
export function pinnedDrift(folder, pinned) {
  const { libs } = openLibraries(folder, pinned);
  const problems = [];
  for (const [module, { library }] of libs.modules) {
    if (pinned.libraryOf.get(module) !== library) problems.push(`${module} is in ${library}'s sources but not in its pinned module list`);
  }
  for (const [module, library] of pinned.libraryOf) {
    const found = libs.modules.get(module);
    if (found && found.library !== library) problems.push(`${module} is listed under ${library} but found in ${found.library}`);
  }
  return problems;
}

// Checks the import lines of a Solution. Resolves to {problems, notes}:
// `notes` say what could not be checked (never a failure).
export function importLint(code, language, { libs: libsOverride } = {}) {
  const pinned = loadPinned(language);
  const folder = libsFolder(libsOverride);
  const sources = folder ? openLibraries(folder, pinned) : null;
  const problems = [];
  const notes = [];
  if (!sources) {
    notes.push("PureScript imports: names not checked against the library sources (set PURS_LIBS to a folder of the pinned libraries' checkouts); modules and one-line form were checked from languages/purescript/packages.json");
  } else if (sources.missing.length > 0) {
    notes.push(`PureScript imports: PURS_LIBS lacks pinned libraries (${sources.missing.join(", ")}); names imported from their modules were not checked`);
  }
  code.split(/\r?\n/).forEach((line, i) => {
    if (!language.importLine.test(line)) return;
    const where = `line ${i + 1}`;
    const m = oneLineImport.exec(line.trim());
    if (!m || /\b(qualified|hiding|as)\b/.test(line)) {
      problems.push(`${where}: only one-line imports are allowed (import M (a, b)): ${line.trim()}`);
    } else if (!primModule.test(m[1]) && !pinned.libraryOf.has(m[1])) {
      problems.push(`${where}: ${m[1]} is not in a pinned library`);
    } else if (sources && !primModule.test(m[1])) {
      problems.push(...importNameProblems(sources.libs, parseImportLine(line), where));
    }
  });
  return { problems, notes };
}
