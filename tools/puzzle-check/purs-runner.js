// The PureScript runner for run-solutions.js. It compiles a Reference Solution
// with the same purs-core.wasm the browser downloads, in Node through WASI, then
// runs the generated JavaScript against the Puzzle's tests.
//
// Configuration (environment variables):
//   PURS_WASM   path to purs-core.wasm. Unset: every PureScript row fails.
//   PURS_LIBS   where the library sources are: a folder of checkouts of the
//               pinned libraries, `<name>/src/**/*.purs` with the `.js`
//               foreign files beside them. Only used to compile; WHICH
//               libraries (and so which modules a Solution may import) is the
//               committed list, languages/purescript/packages.json. A pinned
//               library missing from the folder is an error.
//
// The work folder is built once per process and kept between Puzzles, so the
// compiler's cached externs for the libraries are built once (about 3.4 s for
// Prelude) and each later check takes 0.2 to 0.4 s.
import {
  closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync,
  rmSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { WASI } from "node:wasi";
import { languageNamed } from "./languages.js";
import { importLint, libsFolder, loadPinned } from "./purs-imports.js";

const here = dirname(fileURLToPath(import.meta.url));
const language = languageNamed("purescript");
const timeoutMs = language.timeouts.runMs;
const header = "module Main where\n";

// * The work folder, seen by the compiler as /w

const sessions = new Map();

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

// Builds /w: lib/<name>/ (each library's src), src/ for Main.purs, out/ for
// the compiler's output and externs. Resolves to the session, or throws a
// message for the Puzzle row.
export async function openSession(wasmPath, libsPath) {
  const dir = mkdtempSync(join(tmpdir(), "puzzle-check-purs-"));
  const session = { dir, srcFiles: [], tick: 0 };
  try {
    session.module = await WebAssembly.compile(readFileSync(wasmPath));
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "out"));
    // The generated modules are ES modules.
    writeFileSync(join(dir, "out", "package.json"), '{"type":"module"}\n');
    // Only the pinned libraries, whatever else the folder holds.
    const missing = [];
    for (const lib of loadPinned(language).libraries) {
      const from = join(libsPath, lib.name, "src");
      if (existsSync(from)) cpSync(from, join(dir, "lib", lib.name), { recursive: true });
      else missing.push(lib.name);
    }
    if (missing.length > 0) throw new Error(`${libsPath} lacks pinned libraries: ${missing.join(", ")}`);
    for (const file of existsSync(join(dir, "lib")) ? walk(join(dir, "lib")) : []) {
      if (!file.endsWith(".purs")) continue;
      session.srcFiles.push("/w" + file.slice(dir.length));
    }
    session.srcFiles.sort();
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return session;
}

// One session per (compiler, libraries) pair; a failed one is not kept.
function sessionFor(wasmPath, libsPath) {
  const key = `${wasmPath}\0${libsPath}`;
  if (!sessions.has(key)) {
    const pending = openSession(wasmPath, libsPath);
    sessions.set(key, pending);
    pending.catch(() => sessions.delete(key));
  }
  return sessions.get(key);
}

// * Compiling

export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

// The first error in the compiler's text as one line: "line:col message".
// Positions refer to the player's code, so the module header we add is taken
// off the line number.
export function firstError(text, lineOffset) {
  const lines = stripAnsi(text).split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*at \S+:\d+:\d+/.test(l));
  const pos = at >= 0 ? /:(\d+):(\d+)/.exec(lines[at]) : null;
  const rest = lines.slice(at >= 0 ? at + 1 : 0).filter((l) => !/^\s*(Error|Warning) found/.test(l));
  // The message ends where the "See https://…" link begins.
  const stop = rest.findIndex((l) => /^\s*See https?:/.test(l));
  const body = (stop >= 0 ? rest.slice(0, stop) : rest).map((l) => l.trim()).filter(Boolean);
  const msg = body.join(" ").replace(/\s+/g, " ").slice(0, 300) || "compile error";
  return pos ? `${Number(pos[1]) - lineOffset}:${pos[2]} ${msg}` : msg;
}

// Runs the compiler once on the session's files plus Main.purs.
export function runCompiler(session, source, harness) {
  const main = join(session.dir, "src", "Main.purs");
  writeFileSync(main, source);
  const files = ["/w/src/Main.purs"];
  if (harness) {
    writeFileSync(join(session.dir, "src", "Harness.purs"), harness);
    files.push("/w/src/Harness.purs");
  }
  // The compiler skips files whose modified time hasn't moved: make every
  // write later than the last.
  const when = new Date(Date.now() + 1000 * ++session.tick);
  for (const f of files) utimesSync(join(session.dir, f.slice(3)), when, when);
  const outPath = join(session.dir, "stdout.txt");
  const errPath = join(session.dir, "stderr.txt");
  const [outFd, errFd] = [openSync(outPath, "w"), openSync(errPath, "w")];
  let exit;
  try {
    const wasi = new WASI({
      version: "preview1",
      args: ["purs-core", "/w/out", ...session.srcFiles, ...files],
      env: {},
      preopens: { "/w": session.dir },
      stdout: outFd,
      stderr: errFd,
      returnOnExit: true,
    });
    const instance = new WebAssembly.Instance(session.module, { wasi_snapshot_preview1: wasi.wasiImport });
    exit = wasi.start(instance);
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
  return { exit, text: readFileSync(outPath, "utf8") + readFileSync(errPath, "utf8") };
}

// * Calling convention

// A function with constraints in its type takes one argument per constraint
// before its own: `unique :: forall a. Eq a => Array a -> Array a` compiles to
// `unique(dictEq)(items)`. The tests only know JSON values, so the runner
// reads the constraints off the function's signature in the code and decides
// how to call it:
//   "eq"     the test worker supplies an Eq dictionary for JSON values;
//   "other"  a row-solved constraint (Union, Nub, ...): the argument is ignored,
//            the worker supplies any value;
//   "typed"  anything else (RowToList, Ord, Show, a class the Solution
//            defines): the dictionary holds real methods that depend on the
//            types of the test's values, so the runner has the compiler build
//            it (see harnessSource). Any one "typed" constraint sends the
//            function down the typed path, and then the compiler resolves
//            every constraint, Eq included.
const cheapClasses = { Eq: "eq", Union: "other", Nub: "other", Lacks: "other", Cons: "other", Append: "other" };

export function dictionaryKinds(code, fn) {
  const at = new RegExp(`^${fn}\\s*::((?:.*)(?:\\r?\\n[ \\t]+.*)*)`, "m").exec(code);
  if (!at) return [];
  const type = at[1].replace(/\bforall\b[^.]*\./, "");
  const parts = type.split("=>").slice(0, -1);
  return parts
    .flatMap((part) => {
      const t = part.trim();
      return t.startsWith("(") && t.endsWith(")") ? t.slice(1, -1).split(",") : [t];
    })
    .map((c) => cheapClasses[/^[A-Z]\w*/.exec(c.trim())?.[0]] ?? "typed");
}

// The typed path. For a function the harness cannot give dictionaries to, it
// writes a module Harness with one function per test, `t0 _ = f <args>`, where
// the arguments are PureScript literals typed from the test's JSON:
//   string -> String       integer within 32 bits -> Int     other number -> Number
//   boolean -> Boolean     object -> record, every key a quoted label
//   array -> Array of one element type (every element must give the same type)
// The compiler then picks the instances for those types. A JSON value it
// cannot type (null, an array of mixed types, an empty array whose element type
// nothing fixes, a string with a character outside printable ASCII, a number
// beyond what is written plainly) throws a message naming the test and the
// value's place.
const int32 = (n) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;

// Returns {code, type}: PureScript source for the value and a string naming
// its type shape, so array elements can be checked against each other.
function literal(value, where) {
  if (typeof value === "string") {
    if (!/^[\x20-\x7e]*$/.test(value)) throw new Error(`${where}: a string with a character outside printable ASCII cannot be written as a literal`);
    return { code: JSON.stringify(value), type: "String" };
  }
  if (typeof value === "boolean") return { code: String(value), type: "Boolean" };
  if (typeof value === "number") {
    const text = String(value);
    if (/e/i.test(text)) throw new Error(`${where}: the number ${text} cannot be written plainly`);
    if (int32(value)) return { code: value < 0 ? `(${text})` : text, type: "Int" };
    const num = Number.isInteger(value) ? `${text}.0` : text;
    return { code: value < 0 ? `(${num})` : num, type: "Number" };
  }
  if (Array.isArray(value)) {
    const items = value.map((v, i) => literal(v, `${where}[${i}]`));
    if (items.length === 0) throw new Error(`${where}: an empty array has no element type to give the compiler`);
    const types = new Set(items.map((i) => i.type));
    if (types.size > 1) throw new Error(`${where}: an array of mixed types (${[...types].join(", ")}) has no PureScript type`);
    return { code: `[${items.map((i) => i.code).join(", ")}]`, type: `Array ${[...types][0]}` };
  }
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(([k, v]) => [k, literal(v, `${where}.${k}`)]);
    return {
      code: `{ ${fields.map(([k, v]) => `${JSON.stringify(k)}: ${v.code}`).join(", ")} }`.replace("{  }", "{}"),
      type: `{${fields.map(([k, v]) => `${k}:${v.type}`).join(",")}}`,
    };
  }
  throw new Error(`${where}: ${value === null ? "null" : typeof value} has no PureScript type`);
}

export function harnessSource(puzzle) {
  const lines = puzzle.tests.map((t, i) => {
    const args = t.args.map((a, j) => literal(a, `test ${i + 1} args[${j}]`).code);
    return `t${i} _ = ${puzzle.function} ${args.join(" ")}`;
  });
  return `module Harness where\n\nimport Prelude\nimport Main (${puzzle.function})\n\n${lines.join("\n")}\n`;
}

// * Running

// Runs the compiled Main against the tests in a worker, with the timeout.
function runTests(session, puzzle, dicts, options, typed) {
  const timeout = options?.timeout ?? timeoutMs;
  // A new query each time, so the import isn't served from the module cache.
  const mainUrl = pathToFileURL(join(session.dir, "out", "Main", "index.js")).href + `?v=${session.tick}`;
  return new Promise((done) => {
    const worker = new Worker(join(here, "purs-test-worker.js"), {
      workerData: { mainUrl: typed ? mainUrl.replace("/Main/", "/Harness/") : mainUrl, fn: puzzle.function, dicts, tests: puzzle.tests, typed },
    });
    const timer = setTimeout(() => finish({ kind: "timeout" }), timeout);
    const finish = (r) => {
      clearTimeout(timer);
      worker.terminate();
      done(r);
    };
    worker.on("message", finish);
    worker.on("error", (err) => finish({ kind: "error", message: String(err) }));
    worker.on("exit", (code) => finish({ kind: "error", message: `the test worker exited (${code})` }));
  });
}

const callText = (puzzle, test) => `${puzzle.function}(${test.args.map((a) => JSON.stringify(a)).join(", ")})`;

// The runner: (puzzle, code, options) -> problems. `options` may carry
// {timeout, wasm, libs} to override the environment. The import check comes
// first and needs neither the compiler nor the library sources.
export async function purescriptProblems(puzzle, code, options = {}) {
  const lint = importLint(code, language, options).problems;
  if (lint.length > 0) return lint;
  const wasm = options.wasm ?? process.env.PURS_WASM;
  const libs = libsFolder(options.libs);
  if (!wasm) return ["no compiler configured for purescript (set PURS_WASM to the path of purs-core.wasm)"];
  if (!existsSync(wasm)) return [`no compiler configured for purescript: ${wasm} does not exist`];
  if (!libs) {
    return ["no library sources for purescript (set PURS_LIBS to a folder of checkouts of the pinned libraries in languages/purescript/packages.json; see tools/puzzle-check/README.md)"];
  }
  let session;
  try {
    session = await sessionFor(resolve(wasm), resolve(libs));
  } catch (err) {
    return [`could not set up the PureScript compiler: ${err.message ?? err}`];
  }

  const hasHeader = /^\s*module\s/.test(code);
  const source = hasHeader ? code : header + code;
  const kinds = dictionaryKinds(code, puzzle.function);
  const typed = kinds.includes("typed");
  let harness;
  if (typed) {
    try {
      harness = harnessSource(puzzle);
    } catch (err) {
      return [`cannot call ${puzzle.function} from the tests: ${err.message}`];
    }
  }
  const { exit, text } = runCompiler(session, source, harness);
  if (exit !== 0) {
    // An error in the generated module is not in the player's code.
    if (typed && /Harness\.purs/.test(stripAnsi(text))) {
      return [`the generated test module does not compile: ${firstError(text, 0)}`];
    }
    return [`compile error at ${firstError(text, hasHeader ? 0 : 1)}`];
  }

  const reply = await runTests(session, puzzle, kinds, options, typed);
  if (reply.kind === "timeout") return [`Reference Solution timed out (over ${options.timeout ?? timeoutMs} ms)`];
  if (reply.kind === "error") return [`Reference Solution crashed: ${reply.message}`];
  return puzzle.tests.flatMap((t, i) =>
    reply.results[i].pass
      ? []
      : [`test ${i + 1} failed: ${callText(puzzle, t)} expected ${JSON.stringify(t.expected)}, got ${reply.results[i].got}`],
  );
}
