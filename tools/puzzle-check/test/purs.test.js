// Tests for the PureScript runner. The fixtures in purs-fixtures/ are
// Solution texts, kept out of puzzles/. The ones that compile need the
// wasm compiler: set PURS_WASM (purs-core.wasm) and PURS_LIBS (a folder of
// pinned libraries with at least Prelude); without them those tests skip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { purescriptProblems } from "../purs-runner.js";
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

compiled("a syntax error gives one line with line and column", async () => {
  const problems = await purescriptProblems(clamp, solution("syntax-error"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^compile error at \d+:\d+ Unable to parse module/);
});

compiled("a failing test is named", async () =>
  assert.deepEqual(await purescriptProblems(clamp, solution("failing-test")), [
    "test 1 failed: clamp(15, 0, 10) expected 10, got 0",
  ]));

compiled("an import outside the pinned libraries fails", async () =>
  assert.deepEqual(await purescriptProblems(clamp, solution("unpinned-import")), [
    "line 2: Data.Array is not in a pinned library",
  ]));

compiled("a wrapped import fails", async () => {
  const problems = await purescriptProblems(clamp, solution("wrapped-import"));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^line 2: only one-line imports are allowed/);
});
