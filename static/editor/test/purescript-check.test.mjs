// PureScript's Checker against fake workers and a fake loader: when the
// compiler worker is made, kept and killed, the two timeouts, the typed path,
// the calling convention's request, waiting for the download. (The real
// compiler and the real scripts: tools/purs-bundle/test/browser-checker.test.mjs.)
// Run with `npm test --prefix static/editor`.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createPurescriptChecker } from "../src/languages/purescript/check.mjs";

const flush = () => new Promise((r) => setImmediate(r));

const manifest = {
  sourceMtime: "2000-01-01T00:00:00Z",
  modules: { Prelude: "prelude", "Data.Array": "arrays", "Data.Tuple": "tuples" },
  parts: { prelude: { requires: [] }, arrays: { requires: ["prelude"] }, tuples: { requires: ["prelude"] } },
};

// A loader that is ready when `release()` is called (or at once).
function fakeLoader({ ready = true } = {}) {
  let release;
  const gate = new Promise((r) => { release = r; });
  const asked = [];
  return {
    module: "the-module", manifest,
    ready: () => (ready ? Promise.resolve() : gate),
    release: () => { ready = true; release(); },
    packs: async (libs) => { asked.push(libs); return [...new Set(libs.flatMap((l) => [l, ...manifest.parts[l].requires]))].sort().map((name) => ({ header: { name } })); },
    asked,
  };
}

// Workers by script: the compiler's answers come from `compiler.reply`, the
// sandbox's from `sandbox.reply`; either may be left silent.
function fakeWorkers({ compile, run } = {}) {
  const made = { compiler: [], sandbox: [] };
  class FakeWorker {
    constructor(url, opts) {
      this.url = url; this.opts = opts; this.sent = []; this.terminated = false; this.onmessage = null;
      this.kind = /compiler/.test(url) ? "compiler" : "sandbox";
      made[this.kind].push(this);
    }
    postMessage(m) {
      this.sent.push(m);
      const handler = this.kind === "compiler" ? compile : run;
      if (!handler) return;
      if (this.kind === "compiler" && m.type !== "check") return;
      const reply = handler(m, this);
      if (reply !== undefined) queueMicrotask(() => this.onmessage?.({ data: this.kind === "compiler" ? { type: "result", id: m.id, ...reply } : reply }));
    }
    terminate() { this.terminated = true; }
  }
  return { FakeWorker, made };
}

const ok = (modules = { Main: { src: "x", foreign: null } }) => ({ exit: 0, text: "", modules });
const results = (...pass) => JSON.stringify({ kind: "results", results: pass.map((p) => ({ pass: p, got: "1" })) });
const tests = [{ args: [1], expected: 2 }];
// What the sandbox was last asked to run (the pool also holds an idle spare).
const lastRun = (made) => JSON.parse(made.sandbox.filter((w) => w.sent.length > 0).at(-1).sent[0]);
const CODE = "import Prelude\n\nf :: Int -> Int\nf x = x + 1\n";

function checker(options = {}) {
  const w = fakeWorkers(options);
  const loader = options.loader ?? fakeLoader();
  const c = createPurescriptChecker({
    Worker: w.FakeWorker, compilerUrl: "js/purs-compiler.js", sandboxUrl: "js/purs-sandbox.js",
    loader, limits: { compileMs: 5000, runMs: 1000 },
  });
  return { c, loader, ...w };
}

test("a passing Solution is compiled, then run against the tests in the sandbox", async () => {
  const { c, made } = checker({ compile: () => ok(), run: () => results(true) });
  const r = await c.check(CODE, "f", tests);
  assert.equal(r.status, "pass");
  assert.deepEqual(r.results, [{ pass: true, got: "1" }]);
  const [init, check] = made.compiler[0].sent;
  assert.deepEqual(init, { type: "init", module: "the-module", sourceMtime: "2000-01-01T00:00:00Z" });
  assert.equal(check.source, "module Main where\n" + CODE, "the module header is added");
  assert.equal(check.harness, null);
  assert.deepEqual(check.imports, ["Prelude"]);
  const request = lastRun(made);
  assert.deepEqual(request, { modules: { Main: { src: "x", foreign: null } }, main: "Main", fn: "f", tests, dicts: [], typed: false });
});

test("a fail is a result, not an error", async () => {
  const { c } = checker({ compile: () => ok(), run: () => results(true, false) });
  assert.equal((await c.check(CODE, "f", tests)).status, "fail");
});

test("the compiler worker is a module worker, made at the first check (no spare), with the compiled compiler", async () => {
  const { c, made } = checker({ compile: () => ok(), run: () => results(true) });
  assert.equal(made.compiler.length, 0);
  await c.check(CODE, "f", tests);
  assert.equal(made.compiler.length, 1);
  assert.deepEqual(made.compiler[0].opts, { type: "module" });
  assert.equal(made.compiler[0].url, "js/purs-compiler.js");
});

test("the first check runs when loading finishes: nothing is compiled while the download is going", async () => {
  const loader = fakeLoader({ ready: false });
  const { c, made } = checker({ compile: () => ok(), run: () => results(true), loader });
  const pending = c.check(CODE, "f", tests);
  await flush();
  assert.equal(made.compiler.length, 0, "no worker before the compiler is there");
  loader.release();
  assert.equal((await pending).status, "pass");
  assert.equal(made.compiler.length, 1);
});

test("a check made stale while loading never compiles; the newer one does", async () => {
  const loader = fakeLoader({ ready: false });
  const { c, made } = checker({ compile: () => ok(), run: () => results(true), loader });
  const first = c.check(CODE, "f", tests);
  const second = c.check(CODE + "\n", "f", tests);
  assert.equal((await first).kind, "stopped");
  loader.release();
  assert.equal((await second).status, "pass");
  assert.equal(made.compiler[0].sent.filter((m) => m.type === "check").length, 1);
});

test("one worker serves every check; the libraries are given once, then only the new ones", async () => {
  const { c, made, loader } = checker({ compile: () => ok(), run: () => results(true) });
  await c.check(CODE, "f", tests);
  await c.check(CODE + "\n", "f", tests);
  await c.check("import Prelude\nimport Data.Array (take)\n" + CODE, "f", tests);
  assert.equal(made.compiler.length, 1);
  const sent = made.compiler[0].sent.filter((m) => m.type === "check").map((m) => m.packs.map((p) => p.header.name));
  assert.deepEqual(sent, [["prelude"], [], ["arrays"]]);
  assert.deepEqual(loader.asked.map((l) => l.join()), ["prelude", "prelude", "arrays,prelude"]);
  assert.equal(made.compiler[0].terminated, false);
});

test("a type error or a syntax error keeps the worker, comes back as an error with line, column and range", async () => {
  const text = "Error found:\nat /w/src/Main.purs:4:12 - 4:15 (line 4, column 12 - line 4, column 15)\n\n  Could not match type\n  String\n  with type\n  Int\n\nSee https://x for more information,\n";
  const { c, made } = checker({ compile: () => ({ exit: 1, text }), run: () => assert.fail("nothing runs after a compile error") });
  const r = await c.check(CODE, "f", tests);
  assert.equal(r.status, "error");
  assert.equal(r.kind, "type");
  assert.equal(r.message, "Could not match type String with type Int");
  assert.equal(r.line, 3);
  assert.equal(r.column, 12);
  assert.ok(r.range.to > r.range.from);
  assert.equal(made.compiler[0].terminated, false, "only a timeout kills the worker");
  const syntax = text.replace("Could not match type\n  String\n  with type\n  Int", "Unable to parse module:\n  Unexpected token");
  const again = checker({ compile: () => ({ exit: 1, text: syntax }) });
  assert.equal((await again.c.check(CODE, "f", tests)).kind, "syntax");
});

test("compile timeout: after 5 s the worker is killed and the check is a timeout; the next worker is given the libraries again", { timeout: 5000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let silent = true;
  const { c, made } = checker({ compile: () => (silent ? undefined : ok()), run: () => results(true) });
  const first = c.check(CODE, "f", tests);
  await flush();
  t.mock.timers.tick(4999);
  await flush();
  assert.equal(made.compiler[0].terminated, false, "not yet");
  t.mock.timers.tick(1);
  const r = await first;
  assert.equal(r.status, "error");
  assert.equal(r.kind, "timeout");
  assert.match(r.message, /Compiling took more than 5 s/);
  assert.equal(made.compiler[0].terminated, true);
  silent = false;
  const second = await c.check(CODE, "f", tests);
  assert.equal(second.status, "pass");
  assert.equal(made.compiler.length, 2, "a new worker");
  assert.deepEqual(made.compiler[1].sent.filter((m) => m.type === "check")[0].packs.map((p) => p.header.name), ["prelude"], "rebuilt from the saved downloads");
  assert.equal(made.compiler[1].sent[0].type, "init");
});

test("a compile slower than the 1 s run timeout is fine: the 1 s applies to running the tests only", { timeout: 5000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let answer;
  const { c, made } = checker({ compile: (m, w) => { answer = () => w.onmessage({ data: { type: "result", id: m.id, ...ok() } }); }, run: () => results(true) });
  const p = c.check(CODE, "f", tests);
  await flush();
  t.mock.timers.tick(3000);
  await flush();
  answer();
  assert.equal((await p).status, "pass");
  assert.equal(made.compiler[0].terminated, false);
});

test("run timeout: the generated JavaScript is stopped after 1 s in the sandbox, the compiler worker stays", { timeout: 5000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { c, made } = checker({ compile: () => ok(), run: () => undefined });
  const p = c.check(CODE, "f", tests);
  await flush();
  await flush();
  t.mock.timers.tick(999);
  await flush();
  assert.equal(made.sandbox.every((w) => !w.terminated), true);
  t.mock.timers.tick(1);
  const r = await p;
  assert.equal(r.kind, "timeout");
  assert.equal(r.message, "Stopped after 1.0 s: an infinite loop?");
  assert.equal(made.sandbox[0].terminated, true, "a fresh sandbox is used and thrown away");
  assert.equal(made.compiler[0].terminated, false);
});

test("each run takes a fresh sandbox worker and starts the next spare", async () => {
  const { c, made } = checker({ compile: () => ok(), run: () => results(true) });
  await c.check(CODE, "f", tests);
  await c.check(CODE + "\n", "f", tests);
  assert.ok(made.sandbox.length >= 3, "a spare at the start, one more per run");
  assert.ok(made.sandbox[0].terminated && made.sandbox[1].terminated);
  assert.equal(made.sandbox[0].url, "js/purs-sandbox.js");
});

test("a newer check waits for the compile in flight, the older result is dropped, the worker is not killed", async () => {
  const waiting = [];
  const { c, made } = checker({ compile: (m, w) => { waiting.push(() => w.onmessage({ data: { type: "result", id: m.id, ...ok() } })); }, run: () => results(true) });
  const first = c.check(CODE, "f", tests);
  await flush();
  assert.equal(waiting.length, 1);
  const second = c.check(CODE + "\n", "f", tests);
  assert.equal((await first).kind, "stopped");
  await flush();
  assert.equal(waiting.length, 1, "the newer compile has not started: the worker is busy");
  waiting[0]();
  await flush();
  await flush();
  assert.equal(waiting.length, 2, "it starts when the older compile is done");
  waiting[1]();
  assert.equal((await second).status, "pass");
  assert.equal(made.compiler.length, 1);
  assert.equal(made.compiler[0].terminated, false);
});

test("stop() ends the check in flight as stopped and never kills the compiler worker", async () => {
  const { c, made } = checker({ compile: () => undefined });
  const p = c.check(CODE, "f", tests);
  await flush();
  c.stop();
  assert.equal((await p).kind, "stopped");
  assert.equal(made.compiler[0].terminated, false);
});

// --- The calling convention ------------------------------------------------------

test("Eq and row-solved constraints become dictionary arguments the sandbox supplies, in order", async () => {
  const { c, made } = checker({ compile: () => ok(), run: () => results(true) });
  await c.check("import Prelude\nunique :: forall a. Eq a => Array a -> Array a\nunique x = x\n", "unique", tests);
  assert.deepEqual(lastRun(made).dicts, ["eq"]);
  assert.equal(lastRun(made).typed, false);
  await c.check("import Prelude\nf :: forall a b c d. Union a b c => Nub c d => Record a -> Record b -> Record d\nf x = x\n", "f", tests);
  assert.deepEqual(lastRun(made).dicts, ["other", "other"]);
});

test("any other constraint takes the typed path: a Harness module is compiled with the Solution and its t<i> are called", async () => {
  const { c, made, loader } = checker({ compile: () => ok({ Harness: { src: "h", foreign: null } }), run: () => results(true) });
  const code = "f :: forall a. Show a => a -> String\nf x = show x\n";
  const two = [{ args: [1], expected: "1" }, { args: ["a"], expected: "\"a\"" }];
  const r = await c.check(code, "f", two);
  assert.equal(r.status, "pass");
  const check = made.compiler[0].sent.find((m) => m.type === "check");
  assert.equal(check.harness, "module Harness where\n\nimport Prelude\nimport Main (f)\n\nt0 _ = f 1\nt1 _ = f \"a\"\n");
  assert.ok(check.imports.includes("Prelude"), "the Harness imports Prelude, so its library is in the tree");
  assert.deepEqual(loader.asked[0], ["prelude"]);
  const request = lastRun(made);
  assert.equal(request.main, "Harness");
  assert.equal(request.typed, true);
});

test("the typed path says which test and place has no PureScript type, and compiles nothing", async () => {
  const { c, made } = checker({ compile: () => ok() });
  const r = await c.check("f :: forall a. Show a => a -> String\nf x = show x\n", "f", [{ args: [1], expected: "1" }, { args: [[1, "a"]], expected: "" }]);
  assert.equal(r.status, "error");
  assert.equal(r.kind, "crash");
  assert.match(r.message, /^cannot call f from the tests: test 2 args\[0\]: an array of mixed types \(Int, String\)/);
  assert.equal(made.compiler.length, 0);
});

test("an error inside the generated Harness is not the player's: a crash naming the generated module", async () => {
  const text = "Error found:\nat /w/src/Harness.purs:6:6 - 6:60 (line 6, column 6 - line 6, column 60)\n\n  No type class instance was found for\n  Field Boolean\n\nSee https://x\n";
  const { c } = checker({ compile: () => ({ exit: 1, text }) });
  const r = await c.check("f :: forall a. Show a => a -> String\nf x = show x\n", "f", tests);
  assert.equal(r.kind, "crash");
  assert.equal(r.message, "the generated test module does not compile: 6:6 No type class instance was found for Field Boolean");
});

test("a Solution that writes its own module header is compiled as written", async () => {
  const { c, made } = checker({ compile: () => ok(), run: () => results(true) });
  const code = "module Main where\n\n" + CODE;
  await c.check(code, "f", tests);
  assert.equal(made.compiler[0].sent.find((m) => m.type === "check").source, code);
});

test("the libraries are what the Solution imports and what they need", async () => {
  const { c, loader } = checker({ compile: () => ok(), run: () => results(true) });
  await c.check("import Prelude\nimport Data.Array (take)\nimport Data.Tuple (Tuple(..))\nimport Prim.Row (class Union)\nimport Not.There\n", "f", tests);
  assert.deepEqual(loader.asked[0], ["arrays", "prelude", "tuples"], "what they need too; Prim.Row and an unknown module are in no library");
});

test("a sandbox that crashes or sends nonsense is a crash result", async () => {
  const a = checker({ compile: () => ok(), run: () => JSON.stringify({ kind: "error", message: "f is not exported as a function" }) });
  assert.equal((await a.c.check(CODE, "f", tests)).message, "f is not exported as a function");
  const b = checker({ compile: () => ok(), run: () => "not json" });
  assert.equal((await b.c.check(CODE, "f", tests)).kind, "crash");
});

test("a library that cannot be fetched is a crash result naming the cause", async () => {
  const loader = fakeLoader();
  loader.packs = async () => { throw new Error("could not fetch x (500)"); };
  const { c } = checker({ loader, compile: () => ok() });
  const r = await c.check(CODE, "f", tests);
  assert.equal(r.kind, "crash");
  assert.match(r.message, /could not fetch x \(500\)/);
});
