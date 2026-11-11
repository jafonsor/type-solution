// The browser Checker's calling convention against this folder's runner
// (purs-runner.js), so the two cannot drift: the same constraint kinds, the
// same generated Harness module and the same refusals for every Puzzle in the
// bank and for odd inputs; and the same cleaned error message for a compiler
// text. No compiler needed. (The browser side is
// static/editor/src/languages/purescript/; ticket 31.)
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { dictionaryKinds, firstError, harnessSource } from "../purs-runner.js";
import { defaultPuzzlesDir, readPuzzle } from "../puzzle-check.js";
import { solutionsOf } from "../run-solutions.js";
import * as browser from "../../../static/editor/src/languages/purescript/calling.mjs";
import { compileError } from "../../../static/editor/src/languages/purescript/errors.mjs";

const puzzles = readdirSync(defaultPuzzlesDir).filter((n) => n.endsWith(".toml")).sort().map((n) => {
  const { puzzle } = readPuzzle(n.slice(0, -5), readFileSync(join(defaultPuzzlesDir, n), "utf8"));
  return puzzle;
});

const outcome = (f) => { try { return { ok: f() }; } catch (err) { return { error: err.message }; } };

test("every Puzzle in the bank: the browser reads the same constraints and writes the same Harness", () => {
  assert.ok(puzzles.length >= 50);
  let typed = 0;
  for (const puzzle of puzzles) {
    const code = solutionsOf(puzzle).find((s) => s.language === "purescript").code;
    const kinds = dictionaryKinds(code, puzzle.function);
    assert.deepEqual(browser.dictionaryKinds(code, puzzle.function), kinds, puzzle.identity);
    assert.equal(browser.needsHarness(kinds), kinds.includes("typed"), puzzle.identity);
    // The Harness for every Puzzle, typed or not: same text or same refusal.
    assert.deepEqual(outcome(() => browser.harnessSource(puzzle)), outcome(() => harnessSource(puzzle)), puzzle.identity);
    if (kinds.includes("typed")) typed++;
  }
  assert.ok(typed >= 1, "the bank has a Puzzle on the typed path (queryString)");
});

test("odd signatures: the same kinds", () => {
  const sigs = [
    "f :: Int -> Int",
    "f :: forall a. Eq a => Array a -> Array a",
    "f :: forall a b c d. Union a b c => Nub c d => Record a -> Record b -> Record d",
    "f :: forall a. (Eq a, Show a) => a -> String",
    "f :: forall r rl. RowToList r rl => Keys rl => Record r -> String",
    "f :: forall a. Ord a => Array a -> Array a",
    "f\n  :: forall a\n   . Eq a\n  => a\n  -> a",
    "f :: forall a. Lacks \"x\" a => Cons \"x\" Int a b => Record a -> Record b",
    "f :: forall a. Append a a b => Proxy a -> Proxy b",
  ];
  for (const sig of sigs) {
    const code = `import Prelude\n\n${sig}\nf x = x\n`;
    assert.deepEqual(browser.dictionaryKinds(code, "f"), dictionaryKinds(code, "f"), sig);
  }
  const two = "g :: Eq a => a -> a\nf :: Int -> Int\n";
  assert.deepEqual(browser.dictionaryKinds(two, "f"), dictionaryKinds(two, "f"));
});

test("odd JSON: the same literals and the same refusals", () => {
  const values = [
    [{ q: "cats", n: -3, big: 3000000000, x: 1.5, ok: true, l: [[1], [2, 3]], o: {} }, "s"],
    [{ a: [null] }], [[1, "a"]], [{ list: [] }], ["café"], [1e21], [-0.5], [2147483647], [2147483648], [-2147483648], [-2147483649],
    [[]], [{}], [[{ a: 1 }, { a: 2 }]], [[{ a: 1 }, { b: 2 }]], [true, false], [undefined].slice(1),
  ];
  for (const args of values) {
    const puzzle = { function: "f", tests: [{ args: [1] }, { args }] };
    assert.deepEqual(outcome(() => browser.harnessSource(puzzle)), outcome(() => harnessSource(puzzle)), JSON.stringify(args));
  }
});

test("the same cleaned message for the compiler's text", () => {
  const text = `Error found:
in module Main
at /w/src/Main.purs:9:5 - 9:8 (line 9, column 5 - line 9, column 8)

  Could not match type
  \x1b[33m        \x1b[0m
  \x1b[33m  String\x1b[0m
  \x1b[33m        \x1b[0m
  with type
  \x1b[33m  Int\x1b[0m

while checking that type \x1b[33mString\x1b[0m
  is at least as general as type \x1b[33mInt\x1b[0m
in value declaration \x1b[33mg\x1b[0m

See https://github.com/purescript/documentation/blob/master/errors/TypesDoNotUnify.md for more information,
or to contribute content related to this error.

RESULT: errors
`;
  const code = "xxxxxxxx\n".repeat(10);
  // puzzle-check: "line:col message", the module header taken off the line.
  assert.equal(`${compileError(text, code, 1, false).line}:${compileError(text, code, 1, false).column} ${compileError(text, code, 1, false).message}`, firstError(text, 1));
});
