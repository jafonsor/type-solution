// The browser's PureScript Checker with the REAL compiler, in Node: the same
// scripts the page runs (the compiler worker, the sandbox runner), each in a
// worker thread, over a bundle built here, with the same loader. Judged against
// puzzle-check's Node runner (purs-runner.js), so the two cannot drift:
// every Reference Solution passes in both, a Solution that fails a test fails
// in both, and a compile error reads the same. Needs PURS_WASM and PURS_LIBS
// (builds the bundle), like build.test.mjs. Ticket 31.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "../build.mjs";
import { createBundle } from "../../../static/bundle/bundle.mjs";
import { fakeCaches } from "../../../static/bundle/test/fakes.mjs";
import { createLoader } from "../../../static/editor/src/languages/purescript/loader.mjs";
import { createPurescriptChecker } from "../../../static/editor/src/languages/purescript/check.mjs";
import { createCompiler } from "../../../static/editor/src/languages/purescript/compiler.mjs";
import { nodeWorkerClass } from "../../../static/editor/test/helpers/node-worker.mjs";
import { readPack } from "../../../static/bundle/pack.mjs";
import { importedModules, librariesFor } from "../../../static/bundle/purs-tree.mjs";
import { firstError, purescriptProblems } from "../../puzzle-check/purs-runner.js";
import { defaultPuzzlesDir, readPuzzle } from "../../puzzle-check/puzzle-check.js";
import { solutionsOf } from "../../puzzle-check/run-solutions.js";

const have = process.env.PURS_WASM && process.env.PURS_LIBS;
const skip = !have && "set PURS_WASM and PURS_LIBS";
const editor = fileURLToPath(new URL("../../../static/editor/src/languages/purescript/", import.meta.url));
let dir, manifest, loader, checker, limits;
const workers = [];

before(async () => {
  if (!have) return;
  dir = mkdtempSync(join(tmpdir(), "browser-checker-"));
  const built = await buildBundle({ wasm: process.env.PURS_WASM, libs: process.env.PURS_LIBS, out: dir });
  manifest = JSON.parse(readFileSync(join(dir, built.manifestFile), "utf8"));
  const base = "http://localhost/purs/";
  const fetch = async (url) => {
    const name = new URL(url).pathname.split("/").pop();
    try { return new Response(readFileSync(join(dir, name))); } catch { return new Response("nope", { status: 404 }); }
  };
  loader = createLoader({ createBundle, fetch, caches: fakeCaches(), entry: base + "current.json", base });
  await loader.start();
  const Base = nodeWorkerClass({ "purs-compiler.js": editor + "compiler-worker.js", "purs-sandbox.js": editor + "sandbox.js" });
  const Worker = class extends Base { constructor(...a) { super(...a); workers.push(this); } };
  limits = { compileMs: 60000, runMs: 1000 };
  checker = createPurescriptChecker({ Worker, compilerUrl: "http://x/js/purs-compiler.js", sandboxUrl: "http://x/js/purs-sandbox.js", loader, limits });
});

after(() => { checker?.stop(); for (const w of workers) w.terminate(); });

const puzzles = () => readdirSync(defaultPuzzlesDir).filter((n) => n.endsWith(".toml")).sort().map((n) => readPuzzle(n.slice(0, -5), readFileSync(join(defaultPuzzlesDir, n), "utf8")).puzzle);
const reference = (p) => solutionsOf(p).find((s) => s.language === "purescript").code;

test("every Puzzle's Reference Solution passes in the browser Checker, as it does in puzzle-check", { skip, timeout: 600000 }, async () => {
  const all = puzzles();
  assert.ok(all.length >= 50);
  const disagree = [];
  for (const p of all) {
    const code = reference(p);
    const r = await checker.check(code, p.function, p.tests);
    const node = await purescriptProblems(p, code);
    if (r.status !== "pass" || node.length > 0) disagree.push(`${p.identity}: browser ${r.status} ${r.message ?? ""}; node ${node.join("; ") || "pass"}`);
  }
  assert.deepEqual(disagree, []);
});

test("a Solution that fails a test fails in both, for a plain Puzzle, an Eq one, a Tuple one and the typed one", { skip, timeout: 300000 }, async () => {
  for (const id of ["fizzBuzz", "unique", "zip", "queryString", "withDefaults"]) {
    const p = puzzles().find((q) => q.function === id || q.identity === id);
    if (!p) continue;
    const wrong = { ...p, tests: p.tests.map((t, i) => (i === 0 ? { ...t, expected: "not it" } : t)) };
    const r = await checker.check(reference(p), p.function, wrong.tests);
    const node = await purescriptProblems(wrong, reference(p));
    assert.equal(r.status, "fail", id);
    assert.equal(r.results[0].pass, false, id);
    assert.ok(r.results.slice(1).every((t) => t.pass), id);
    assert.equal(node.length, 1, id);
    assert.match(node[0], /^test 1 failed/, id);
  }
});

test("a type error and a syntax error read the same as in puzzle-check, with a position and a range", { skip }, async () => {
  const cases = [
    ["type", "import Prelude\n\nf :: Int -> Int\nf x = x <> \"a\"\n"],
    ["type", "f :: Int\nf = \"s\"\n"],
    ["syntax", "import Prelude\n\nf :: Int -> Int\nf x = (x +\n\ng :: Int\ng = 1\n"],
    ["syntax", "f :: Int -> Int\nf x = x +\n"],
  ];
  for (const [kind, code] of cases) {
    const r = await checker.check(code, "f", [{ args: [1], expected: 1 }]);
    assert.equal(r.status, "error", code);
    assert.equal(r.kind, kind, code);
    assert.ok(r.message.length > 0 && r.line >= 1 && r.column >= 1);
    assert.ok(r.range.to > r.range.from && r.range.to <= code.length);
    const node = await purescriptProblems({ function: "f", tests: [{ args: [1], expected: 1 }] }, code);
    if (kind === "type") {
      assert.equal(node.length, 1);
      assert.ok(node[0].endsWith(r.message), `${node[0]}  /  ${r.message}`);
    } else {
      assert.match(node[0], /Unable to parse module/);
      assert.ok(r.message.startsWith("Unable to parse module"));
    }
  }
  // The syntax error's underline is at the end of the last non-blank line before the reported position.
  const code = "f :: Int -> Int\nf x = x +\n\n";
  const r = await checker.check(code, "f", []);
  assert.equal(code.slice(r.range.from, r.range.to), "+");
  assert.equal(r.line, 2);
});

test("a Solution that never ends is stopped after 1 s in a fresh sandbox, and the next check passes", { skip }, async () => {
  const loop = "import Prelude\n\nf :: Int -> Int\nf x = f x\n";
  const t0 = Date.now();
  const r = await checker.check(loop, "f", [{ args: [1], expected: 1 }]);
  const took = Date.now() - t0;
  assert.equal(r.kind, "timeout");
  assert.equal(r.message, "Stopped after 1.0 s: an infinite loop?");
  assert.ok(took >= 1000, `stopped too early: ${took} ms`);
  const next = await checker.check("import Prelude\n\nf :: Int -> Int\nf x = x\n", "f", [{ args: [1], expected: 1 }]);
  assert.equal(next.status, "pass");
});

test("the compile timeout kills the worker; the next check gets a new one that rebuilds its tree from the saved downloads", { skip }, async () => {
  const before = workers.filter((w) => /compiler/.test(w.constructor.name) || true).length;
  limits.compileMs = 1; // nothing compiles in a millisecond
  const r = await checker.check("import Prelude\n\nf :: Int -> Int\nf x = x\n", "f", [{ args: [1], expected: 1 }]);
  limits.compileMs = 60000;
  assert.equal(r.kind, "timeout");
  assert.match(r.message, /Compiling took more than/);
  const again = await checker.check("import Prelude\n\nf :: Int -> Int\nf x = x\n", "f", [{ args: [1], expected: 1 }]);
  assert.equal(again.status, "pass");
  assert.ok(workers.length > before);
});

// --- The modified-time rule, with the compiler itself --------------------------------

// What the compiler says it compiled: ["Main"] when the libraries were taken as built.
async function compiledModules(code, mtimes) {
  const module = await WebAssembly.compile(readFileSync(join(dir, manifest.core.compiler.file)));
  const packs = await Promise.all(librariesFor(manifest, importedModules(code)).map(async (l) => readPack(new Uint8Array(readFileSync(join(dir, manifest.parts[l].file))))));
  const c = createCompiler({ module, sourceMtime: mtimes ?? manifest.sourceMtime });
  c.add(packs);
  const r = await c.compile({ source: "module Main where\n" + code, imports: importedModules(code) });
  assert.equal(r.exit, 0, r.text);
  return r.text.split("\n").filter((l) => /Compiling/.test(l)).map((l) => l.replace(/^.*Compiling /, ""));
}

test("a check compiles only Main: every pack file reports the manifest's modified time", { skip, timeout: 300000 }, async () => {
  assert.deepEqual(await compiledModules("import Prelude\n\nf :: Int -> Int\nf x = x + 1\n"), ["Main"]);
  assert.deepEqual(await compiledModules("import Prelude\nimport Data.Array (take)\n\nf :: Array Int -> Array Int\nf x = take 1 x\n"), ["Main"]);
});

test("the worker gets only the reachable sources, not every file in the tree", { skip }, async () => {
  const code = "import Prelude\nimport Data.Array (take)\n\nf :: Array Int -> Array Int\nf x = take 1 x\n";
  const module = await WebAssembly.compile(readFileSync(join(dir, manifest.core.compiler.file)));
  const packs = await Promise.all(librariesFor(manifest, importedModules(code)).map(async (l) => readPack(new Uint8Array(readFileSync(join(dir, manifest.parts[l].file))))));
  const c = createCompiler({ module, sourceMtime: manifest.sourceMtime });
  c.add(packs);
  const r = await c.compile({ source: "module Main where\n" + code, imports: importedModules(code) });
  const all = packs.flatMap((p) => p.header.modules).length;
  assert.ok(r.sourceFiles < all, `${r.sourceFiles} given of ${all} modules`);
  assert.ok(r.sourceFiles >= 80 && r.sourceFiles <= 100);
});

test("an edited Main is compiled again, not taken from the compiler's last output: its modified time moves with every check", { skip, timeout: 300000 }, async () => {
  const code = (n) => `import Prelude\n\nf :: Int -> Int\nf x = x + ${n}\n`;
  const module = await WebAssembly.compile(readFileSync(join(dir, manifest.core.compiler.file)));
  const packs = await Promise.all(librariesFor(manifest, ["Prelude"]).map(async (l) => readPack(new Uint8Array(readFileSync(join(dir, manifest.parts[l].file))))));
  const c = createCompiler({ module, sourceMtime: manifest.sourceMtime });
  c.add(packs);
  const go = async (n) => c.compile({ source: "module Main where\n" + code(n), imports: ["Prelude"] });
  const first = await go(1);
  const edited = await go(2);
  const same = await go(2);
  assert.match(first.modules.Main.src, /x \+ 1|add\(x\)\(1\)|\+ 1/);
  assert.match(edited.modules.Main.src, /\+ 2|\(2\)/, "the second check compiled the new text");
  assert.doesNotMatch(edited.modules.Main.src, /\+ 1\b/);
  assert.equal(edited.text.split("\n").filter((l) => /Compiling/.test(l)).length, 1, "only Main was compiled again");
  assert.equal(same.exit, 0);
});
