// Tests for the PureScript runner. The fixtures in purs-fixtures/ are
// Solution texts, kept out of puzzles/. The ones that compile need the
// wasm compiler: set PURS_WASM (purs-core.wasm) and PURS_LIBS (a folder of
// checkouts of the pinned libraries, languages/purescript/packages.json);
// without them those tests skip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dictionaryKinds, harnessSource, purescriptProblems } from "../purs-runner.js";
import { runners } from "../run-solutions.js";

const here = dirname(fileURLToPath(import.meta.url));
const solution = (name) => readFileSync(join(here, "purs-fixtures", name + ".purs"), "utf8");
const clamp = {
  function: "clamp",
  tests: [
    { args: [15, 0, 10], expected: 10 },
    { args: [-3, 0, 10], expected: 0 },
    { args: [7, 0, 10], expected: 7 },
  ],
};
const haveCompiler = process.env.PURS_WASM && process.env.PURS_LIBS;
const compiled = (name, fn) => test(name, { skip: !haveCompiler && "set PURS_WASM and PURS_LIBS" }, fn);

test("without PURS_WASM every PureScript row fails", async () => {
  const problems = await purescriptProblems(clamp, solution("clamp"), { wasm: "" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^no compiler configured for purescript/);
});

test("the PureScript runner is registered", () => assert.equal(runners.purescript, purescriptProblems));

compiled("a passing PureScript Solution passes", async () =>
  assert.deepEqual(await purescriptProblems(clamp, solution("clamp")), []));

compiled("a type error gives one line with line and column", async () => {
  const problems = await purescriptProblems(clamp, solution("type-error"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^compile error at 5:\d+ Could not match type String with type Int/);
  assert.doesNotMatch(problems[0], /\n|\x1b/);
});

// A Warning block comes before the Error block: the error is the one reported.
compiled("a warning before a type error is not the one reported", async () => {
  const problems = await purescriptProblems(clamp, solution("warning-then-error"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^compile error at 5:17 Could not match type String with type Int/);
});

compiled("a syntax error gives one line with line and column", async () => {
  const problems = await purescriptProblems(clamp, solution("syntax-error"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^compile error at \d+:\d+ Unable to parse module/);
});

compiled("a failing test is named", async () =>
  assert.deepEqual(await purescriptProblems(clamp, solution("failing-test")), [
    "test 1 failed: 15, 0, 10 → expected 10, got 0",
  ]));

// The import lint reads the committed list: no compiler and no sources needed.
test("an import outside the pinned libraries fails", async () =>
  assert.deepEqual(await purescriptProblems(clamp, solution("unpinned-import"), { wasm: "", libs: "" }), [
    "line 2: Data.Fake.Missing is not in a pinned library",
  ]));

test("a wrapped import fails", async () => {
  const problems = await purescriptProblems(clamp, solution("wrapped-import"), { wasm: "", libs: "" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^line 2: only one-line imports are allowed/);
});

test("constraints in a signature become dictionary arguments", () => {
  const kinds = (sig) => dictionaryKinds(`import Prelude\n\n${sig}\nf x = x\n`, "f");
  assert.deepEqual(kinds("f :: Int -> Int"), []);
  assert.deepEqual(kinds("f :: forall a. Eq a => Array a -> Array a"), ["eq"]);
  assert.deepEqual(kinds("f :: forall a b. Union a b c => Nub c d => Record a -> Record d"), ["other", "other"]);
  assert.deepEqual(kinds("f :: forall a. (Eq a, Show a) => a -> String"), ["eq", "typed"]);
  assert.deepEqual(kinds("f :: forall r rl. RowToList r rl => Keys rl => Record r -> String"), ["typed", "typed"]);
  assert.deepEqual(kinds("f :: forall a. Ord a => Array a -> Array a"), ["typed"]);
  assert.deepEqual(kinds("f\n  :: forall a\n   . Eq a\n  => a\n  -> a"), ["eq"]);
  assert.deepEqual(dictionaryKinds("g :: Eq a => a -> a\nf :: Int -> Int\n", "f"), []);
});

compiled("an Eq dictionary is supplied from the signature", async () => {
  const same = {
    function: "same",
    tests: [
      { args: [1, 1], expected: true },
      { args: ["a", "b"], expected: false },
    ],
  };
  assert.deepEqual(await purescriptProblems(same, solution("eq-constraint")), []);
});

test("a Puzzle file's [purescript] table is read, and run-solutions runs it", async () => {
  const { runSolutions, solutionsOf } = await import("../run-solutions.js");
  const dir = join(here, "fixtures", "purescript-table");
  const { readPuzzle } = await import("../puzzle-check.js");
  const { puzzle, problems } = readPuzzle("double", readFileSync(join(dir, "double.toml"), "utf8"));
  assert.equal(problems, undefined);
  assert.deepEqual(solutionsOf(puzzle).map((s) => s.language), ["javascript", "purescript"]);
  const rows = await runSolutions(dir, {
    languages: ["purescript"],
    options: { wasm: process.env.PURS_WASM ?? "", libs: process.env.PURS_LIBS },
  });
  assert.equal(rows.length, 1);
  if (haveCompiler) assert.deepEqual(rows[0].problems, []);
  else assert.match(rows[0].problems[0], /^no compiler configured for purescript/);
});

test("a malformed [purescript] table is a Puzzle file problem", async () => {
  const { readPuzzle } = await import("../puzzle-check.js");
  const base = `function = "f"\nprompt = "p"\n[[tests]]\nargs = []\nexpected = 1\n[javascript]\nsignature = "f()"\nreference = "r"\n`;
  assert.deepEqual(readPuzzle("f", base).problems, ["missing table: [purescript] (every Puzzle needs a Solution in every Language)"]);
  assert.deepEqual(readPuzzle("f", base + `[purescript]\nsignature = "f"\n`).problems, [
    "missing key: reference in [purescript]",
  ]);
  assert.deepEqual(readPuzzle("f", base + `[purescript]\nsignature = "f"\nreference = 3\n`).problems, [
    "purescript.reference must be a string",
  ]);
});

test("the typed path writes a literal per JSON value, typed from it", () => {
  const source = harnessSource({
    function: "f",
    tests: [{ args: [{ q: "cats", n: -3, big: 3000000000, x: 1.5, ok: true, l: [[1], [2, 3]], o: {} }, "s"] }],
  });
  assert.match(source, /^t0 _ = f \{ "q": "cats", "n": \(-3\), "big": 3000000000\.0, "x": 1\.5, "ok": true, "l": \[\[1\], \[2, 3\]\], "o": \{\} \} "s"$/m);
});

test("the typed path names the test and place of a JSON value it cannot type", () => {
  const bad = (args) => () => harnessSource({ function: "f", tests: [{ args: [1] }, { args }] });
  assert.throws(bad([{ a: [null] }]), /test 2 args\[0\]\.a\[0\]: null has no PureScript type/);
  assert.throws(bad([[1, "a"]]), /test 2 args\[0\]: an array of mixed types \(Int, String\)/);
  assert.throws(bad([{ list: [] }]), /test 2 args\[0\]\.list: an empty array has no element type/);
  assert.throws(bad(["caf\u00e9"]), /test 2 args\[0\]: a string with a character outside printable ASCII/);
});

compiled("a user-written class is resolved by the compiler at each test's types", async () => {
  const label = {
    function: "label",
    tests: [
      { args: ["a"], expected: "text a" },
      { args: [7], expected: "number 7" },
    ],
  };
  assert.deepEqual(await purescriptProblems(label, solution("typed-class")), []);
});

compiled("a failing test through the typed path is named", async () => {
  const label = { function: "label", tests: [{ args: [7], expected: "number 8" }] };
  assert.deepEqual(await purescriptProblems(label, solution("typed-class")), [
    'test 1 failed: 7 → expected "number 8", got "number 7"',
  ]);
});

compiled("a test whose values have no instance is reported as the generated module's error", async () => {
  const label = { function: "label", tests: [{ args: [true], expected: "x" }] };
  const problems = await purescriptProblems(label, solution("typed-class"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^the generated test module does not compile: \d+:\d+ No type class instance was found for .*Describe Boolean/);
});

compiled("a JSON shape that cannot be typed fails with a readable message", async () => {
  const label = { function: "label", tests: [{ args: [null], expected: "x" }] };
  assert.deepEqual(await purescriptProblems(label, solution("typed-class")), [
    "cannot call label from the tests: test 1 args[0]: null has no PureScript type",
  ]);
});
