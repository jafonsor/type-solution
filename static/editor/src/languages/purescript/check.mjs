// PureScript's Checker (seam 1): one long-lived compiler worker, a fresh
// compiler instance per check inside it, then the generated JavaScript run
// against the tests in the shared sandbox.
//
// A check:
//   1. waits for the compiler's download (loader.ready()), so the first check
//      runs when loading finishes;
//   2. reads the function's constraints off the Solution (calling.mjs) and, for
//      the typed path, writes the Harness module;
//   3. gives the worker the libraries it does not hold and the Solution; the
//      worker compiles it (fresh instance, persistent tree). Compile timeout
//      5 s, a safety net: only then is the worker killed, and the next one is
//      given the libraries again from the saved downloads. A newer check waits
//      for a compile in flight (the worker cannot be interrupted) and the
//      older one's result is dropped. No spare worker;
//   4. on a clean compile, runs the generated modules in the sandbox
//      (../../sandbox.mjs): a fresh worker, stopped after 1 s.
import { importedModules, librariesFor } from "../../../../bundle/purs-tree.mjs";
import { createSandbox, timeoutMessage } from "../../sandbox.mjs";
import { dictionaryKinds, harnessSource, needsHarness } from "./calling.mjs";
import { compileError } from "./errors.mjs";

const HEADER = "module Main where\n";

const crash = (message) => ({ status: "error", kind: "crash", message, line: 1, column: 1 });
const stopped = () => ({ status: "error", kind: "stopped", message: "stopped", line: 1, column: 1 });

// `env`: {Worker, compilerUrl, sandboxUrl, loader, limits: {compileMs, runMs}}.
// The limits are read when used, so a test can change them.
export function createPurescriptChecker({ Worker, compilerUrl, sandboxUrl, loader, limits }) {
  const sandbox = createSandbox({ Worker, url: sandboxUrl, timeoutMs: () => limits.runMs });
  let generation = 0;
  let pending = null;   // {resolve}: the check in flight, settled "stopped" by a newer one
  let worker = null;    // the compiler worker, made at the first compile
  let held = new Set(); // names of the libraries the worker holds
  let tail = Promise.resolve(); // the compile in flight, so the next waits for it
  let nextId = 0;

  function killWorker() {
    if (!worker) return;
    worker.onmessage = null;
    worker.terminate();
    worker = null;
    held = new Set();
  }

  // Resolves {exit, text, modules} or {timeout: true}.
  function compileOnce(job, packs) {
    if (!worker) {
      worker = new Worker(compilerUrl, { type: "module" });
      held = new Set();
      worker.postMessage({ type: "init", module: loader.module, sourceMtime: loader.manifest.sourceMtime });
    }
    const w = worker;
    const fresh = packs.filter((p) => !held.has(p.header.name));
    const id = ++nextId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { killWorker(); resolve({ timeout: true }); }, limits.compileMs);
      w.onmessage = (e) => {
        if (e.data?.type !== "result" || e.data.id !== id) return;
        clearTimeout(timer);
        w.onmessage = null;
        resolve(e.data);
      };
      for (const p of fresh) held.add(p.header.name);
      w.postMessage({ type: "check", id, source: job.source, harness: job.harness, imports: job.imports, packs: fresh });
    });
  }

  // Queued behind the compile in flight; skipped if a newer check came meanwhile.
  function compile(mine, job, packs) {
    const run = tail.then(() => (mine === generation ? compileOnce(job, packs) : null));
    tail = run.catch(() => {});
    return run;
  }

  function stop() {
    generation++;
    sandbox.stop();
    if (pending) { const p = pending; pending = null; p.resolve(stopped()); }
  }

  async function run(mine, code, fn, tests) {
    await loader.ready();
    if (mine !== generation) return stopped();

    const hasHeader = /^\s*module\s/.test(code);
    const source = hasHeader ? code : HEADER + code;
    const kinds = dictionaryKinds(code, fn);
    const typed = needsHarness(kinds);
    let harness = null;
    if (typed) {
      try {
        harness = harnessSource({ function: fn, tests });
      } catch (err) {
        return crash(`cannot call ${fn} from the tests: ${err.message}`);
      }
    }

    const imports = importedModules(source);
    if (typed) imports.push("Prelude");
    let packs;
    try {
      packs = await loader.packs(librariesFor(loader.manifest, imports));
    } catch (err) {
      return crash(`could not load the libraries this Solution imports: ${err.message ?? err}`);
    }
    if (mine !== generation) return stopped();

    const compiled = await compile(mine, { source, harness, imports }, packs);
    if (mine !== generation || compiled === null) return stopped();
    if (compiled.timeout) {
      return { status: "error", kind: "timeout", line: 1, column: 1, message: `Compiling took more than ${(limits.compileMs / 1000).toFixed(0)} s` };
    }
    if (compiled.exit !== 0) {
      const e = compileError(compiled.text, code, hasHeader ? 0 : 1, typed);
      if (e.harness) return crash(`the generated test module does not compile: ${e.message}`);
      return { status: "error", ...e };
    }

    const outcome = await sandbox.run(JSON.stringify({
      modules: compiled.modules, main: typed ? "Harness" : "Main", fn, tests, dicts: kinds, typed,
    }));
    if (outcome.kind === "stopped") return stopped();
    if (outcome.kind === "timeout") return { status: "error", kind: "timeout", line: 1, column: 1, message: timeoutMessage(limits.runMs) };
    // Timing, for measuring in a browser: the compiler's own time and how many
    // source files it was given.
    return { ...fromReply(outcome.text), timing: { compileMs: compiled.ms, sourceFiles: compiled.sourceFiles } };
  }

  function check(code, fn, tests) {
    stop(); // a newer check ends the older one
    const mine = generation;
    return new Promise((resolve) => {
      pending = { resolve };
      run(mine, code, fn, tests).then(
        (result) => { if (pending?.resolve === resolve) pending = null; resolve(result); },
        (err) => { if (pending?.resolve === resolve) pending = null; resolve(crash(String(err))); },
      );
    });
  }

  return { check, stop };
}

// The sandbox's reply text as a Checker result.
function fromReply(text) {
  let r;
  try { r = JSON.parse(text); } catch { r = null; }
  if (r?.kind === "results") {
    const pass = r.results.length > 0 && r.results.every((t) => t.pass);
    return { status: pass ? "pass" : "fail", message: "", line: 1, column: 1, results: r.results };
  }
  return crash(r?.kind === "error" ? r.message : "The test runner sent an unreadable reply.");
}
