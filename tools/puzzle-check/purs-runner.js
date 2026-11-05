// The PureScript runner for run-solutions.js. It compiles a Reference Solution
// with the same purs-core.wasm the browser downloads, in Node through WASI, then
// runs the generated JavaScript against the Puzzle's tests.
//
// Configuration (environment variables):
//   PURS_WASM   path to purs-core.wasm. Unset: every PureScript row fails.
//   PURS_LIBS   a folder of pinned library checkouts, `<name>/src/**/*.purs`
//               (with the `.js` foreign files beside them). Until the pinned
//               list lives in languages/purescript/, this folder is the list:
//               a Solution may import only the modules found in it.
//
// The work folder is built once per process and kept between Puzzles, so the
// compiler's cached externs for the libraries are built once (about 3.4 s for
// Prelude) and each later check takes 0.2 to 0.4 s.
import {
  closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync,
  rmSync, statSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { WASI } from "node:wasi";
import { timeoutMs } from "./puzzle-check.js";

const here = dirname(fileURLToPath(import.meta.url));
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
async function openSession(wasmPath, libsPath) {
  const dir = mkdtempSync(join(tmpdir(), "puzzle-check-purs-"));
  const session = { dir, srcFiles: [], modules: new Set(), tick: 0 };
  try {
    session.module = await WebAssembly.compile(readFileSync(wasmPath));
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "out"));
    // The generated modules are ES modules.
    writeFileSync(join(dir, "out", "package.json"), '{"type":"module"}\n');
    for (const lib of readdirSync(libsPath, { withFileTypes: true }).filter((e) => e.isDirectory() || e.isSymbolicLink())) {
      const from = join(libsPath, lib.name, "src");
      if (!existsSync(from)) continue;
      cpSync(from, join(dir, "lib", lib.name), { recursive: true });
    }
    for (const file of existsSync(join(dir, "lib")) ? walk(join(dir, "lib")) : []) {
      if (!file.endsWith(".purs")) continue;
      session.srcFiles.push("/w" + file.slice(dir.length));
      const m = /^module\s+([\w.]+)/m.exec(readFileSync(file, "utf8"));
      if (m) session.modules.add(m[1]);
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

// * Lint

const primModule = /^Prim(\.|$)/;
const oneLineImport = /^import\s+([A-Z][\w.]*)(\s*\([^()]*(\([^()]*\)[^()]*)*\))?\s*$/;

// Imports that aren't one line, or that name a library not on the pinned list.
export function importProblems(code, modules) {
  const problems = [];
  code.split(/\r?\n/).forEach((line, i) => {
    if (!/^\s*import\b/.test(line)) return;
    const where = `line ${i + 1}`;
    const m = oneLineImport.exec(line.trim());
    if (!m || /\b(qualified|hiding|as)\b/.test(line)) {
      problems.push(`${where}: only one-line imports are allowed (import M (a, b)): ${line.trim()}`);
    } else if (!primModule.test(m[1]) && !modules.has(m[1])) {
      problems.push(`${where}: ${m[1]} is not in a pinned library`);
    }
  });
  return problems;
}

// * Compiling

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

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
function runCompiler(session, source) {
  const main = join(session.dir, "src", "Main.purs");
  writeFileSync(main, source);
  // The compiler skips files whose modified time hasn't moved: make every
  // write later than the last.
  const when = new Date(Date.now() + 1000 * ++session.tick);
  utimesSync(main, when, when);
  const outPath = join(session.dir, "stdout.txt");
  const errPath = join(session.dir, "stderr.txt");
  const [outFd, errFd] = [openSync(outPath, "w"), openSync(errPath, "w")];
  let exit;
  try {
    const wasi = new WASI({
      version: "preview1",
      args: ["purs-core", "/w/out", ...session.srcFiles, "/w/src/Main.purs"],
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

// * Running

// Runs the compiled Main against the tests in a worker, with the timeout.
function runTests(session, puzzle, options) {
  const timeout = options?.timeout ?? timeoutMs;
  // A new query each time, so the import isn't served from the module cache.
  const mainUrl = pathToFileURL(join(session.dir, "out", "Main", "index.js")).href + `?v=${session.tick}`;
  return new Promise((done) => {
    const worker = new Worker(join(here, "purs-test-worker.js"), {
      workerData: { mainUrl, fn: puzzle.function, tests: puzzle.tests },
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
// {timeout, wasm, libs} to override the environment.
export async function purescriptProblems(puzzle, code, options = {}) {
  const wasm = options.wasm ?? process.env.PURS_WASM;
  const libs = options.libs ?? process.env.PURS_LIBS;
  if (!wasm) return ["no compiler configured for purescript (set PURS_WASM to the path of purs-core.wasm)"];
  if (!existsSync(wasm)) return [`no compiler configured for purescript: ${wasm} does not exist`];
  if (!libs || !existsSync(libs) || !statSync(libs).isDirectory()) {
    return ["no libraries configured for purescript (set PURS_LIBS to a folder of pinned libraries)"];
  }
  let session;
  try {
    session = await sessionFor(resolve(wasm), resolve(libs));
  } catch (err) {
    return [`could not set up the PureScript compiler: ${err.message ?? err}`];
  }
  const lint = importProblems(code, session.modules);
  if (lint.length > 0) return lint;

  const hasHeader = /^\s*module\s/.test(code);
  const source = hasHeader ? code : header + code;
  const { exit, text } = runCompiler(session, source);
  if (exit !== 0) return [`compile error at ${firstError(text, hasHeader ? 0 : 1)}`];

  const reply = await runTests(session, puzzle, options);
  if (reply.kind === "timeout") return [`Reference Solution timed out (over ${options.timeout ?? timeoutMs} ms)`];
  if (reply.kind === "error") return [`Reference Solution crashed: ${reply.message}`];
  return puzzle.tests.flatMap((t, i) =>
    reply.results[i].pass
      ? []
      : [`test ${i + 1} failed: ${callText(puzzle, t)} expected ${JSON.stringify(t.expected)}, got ${reply.results[i].got}`],
  );
}
