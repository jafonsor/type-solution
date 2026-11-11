// Self-tests for the Puzzle bank check. Each folder under fixtures/ holds one
// Puzzle file that passes or fails in exactly one way. The fixtures live here,
// not in puzzles/, because the build embeds every file there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkBank, checkRequest, clauseArities, lengthProblems, readPuzzle, referenceLength, runCheck, symbolCounts, symbolReports } from "../puzzle-check.js";
import { languageNamed } from "../languages.js";

const purescript = languageNamed("purescript");

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(here, "fixtures", name);
const run = promisify(execFile);

// Checks a fixture folder; asserts its one Puzzle file fails with exactly
// one problem matching `pattern`.
async function failsWith(name, pattern) {
  const { ok, failures } = await checkBank(fixture(name));
  assert.equal(ok, false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, "double.toml");
  assert.equal(failures[0].identity, "double");
  assert.equal(failures[0].problems.length, 1, failures[0].problems.join("\n"));
  assert.match(failures[0].problems[0], pattern);
}

test("a sound Puzzle passes", async () => {
  const { ok, failures } = await checkBank(fixture("passing"));
  assert.deepEqual(failures, []);
  assert.equal(ok, true);
});

test("a Reference Solution failing a test fails, naming the test", () =>
  failsWith("failing-test", /^test 2 failed: -3 → expected 6, got -6$/));

test("a Reference Solution that throws in a test fails that test", () =>
  failsWith("crashing", /^test 1 failed: 2 → expected 4, got Error: this Reference Solution always crashes$/));

test("a Reference Solution that throws before any test fails as a crash", () =>
  failsWith("crashing-on-load", /^Reference Solution crashed: Error: this Reference Solution crashes before any test runs$/));

test("a Reference Solution that doesn't define the function fails as a crash", () =>
  failsWith("no-function", /^Reference Solution crashed: ReferenceError: double is not defined$/));

test("a Reference Solution that never ends times out instead of hanging", () =>
  failsWith("endless-loop", /^Reference Solution timed out/));

test("fewer than 4 non-blank lines fails", () => failsWith("too-few-lines", /has 3 non-blank lines; it must have 4–12/));
test("more than 12 non-blank lines fails", () => failsWith("too-many-lines", /has 13 non-blank lines; it must have 4–12/));
test("fewer than 100 characters fails", () => failsWith("too-few-chars", /has 46 characters .* it must have 100–350/));
test("more than 350 characters fails", () => failsWith("too-many-chars", /has 366 characters .* it must have 100–350/));

test("PureScript Reference Solutions have their own limits: 4-30 lines, 100-900 characters", async () => {
  await failsWith("ps-too-few-lines", /^PureScript Reference Solution has 2 non-blank lines; it must have 4–30$/);
  await failsWith("ps-too-many-lines", /^PureScript Reference Solution has 32 non-blank lines; it must have 4–30$/);
  await failsWith("ps-too-few-chars", /^PureScript Reference Solution has 46 characters .* it must have 100–900$/);
  await failsWith("ps-too-many-chars", /^PureScript Reference Solution has 959 characters .* it must have 100–900$/);
});

test("the PureScript limits' bounds are inclusive, and imports are not counted", () => {
  const ps = (n, width) => "import Prelude\nimport Data.Array (cons)\n" + Array.from({ length: n }, () => "x".repeat(width)).join("\n");
  assert.deepEqual(lengthProblems(ps(4, 25), purescript), []); // 4 lines, 100 chars
  assert.deepEqual(lengthProblems(ps(30, 29) + "x".repeat(30), purescript), []); // 30 lines, 900 chars
  assert.equal(lengthProblems(ps(4, 25).slice(0, -1), purescript).length, 1); // 99 chars
  assert.equal(lengthProblems(ps(30, 29) + "x".repeat(31), purescript).length, 1); // 901 chars
  assert.equal(lengthProblems(ps(31, 3), purescript).length, 2); // 31 lines, 93 chars
  // The same text is judged by JavaScript's limits as JavaScript.
  assert.deepEqual(referenceLength(ps(4, 25), purescript), { lines: 4, chars: 100 });
  assert.deepEqual(referenceLength(ps(4, 25)), { lines: 6, chars: 100 + 14 + 24 });
});

// * The PureScript signature (spec, "Puzzle file")

test("a PureScript signature must be exactly two non-blank lines", async () => {
  await failsWith("ps-sig-one-line", /^PureScript signature has 1 non-blank lines; it must have 2 /);
  await failsWith("ps-sig-three-lines", /^PureScript signature has 3 non-blank lines; it must have 2 /);
});

test("the signature's first line is `<function> :: <type>`, the second `<function> <parameters> = ...`", async () => {
  await failsWith("ps-sig-first-line", /^PureScript signature's first line must be `double :: <type>`, not `doubled :: Int -> Int`$/);
  await failsWith("ps-sig-second-line", /^PureScript signature's second line must be `double <parameter names> = \.\.\.`, not `double x = x \* 2`$/);
});

test("the signature's parameters are as many as the tests' arguments", async () => {
  await failsWith("ps-sig-params-vs-tests", /^PureScript signature has 2 parameters, but the tests pass 1 arguments$/);
  await failsWith("ps-sig-tests-differ", /^PureScript signature has 1 parameters, but the tests pass 1 or 2 arguments$/);
});

test("the Reference Solution defines the function with the signature's number of parameters", async () => {
  await failsWith("ps-ref-other-params", /^PureScript Reference Solution defines `double` with 2 parameters; the signature has 1$/);
  await failsWith("ps-ref-point-free", /^PureScript Reference Solution defines `double` with 0 parameters; the signature has 1$/);
  await failsWith("ps-ref-no-function", /^PureScript Reference Solution does not define `double`$/);
});

test("clauses are counted by top-level parameters: patterns, guards, several clauses, the type line skipped", () => {
  const code = [
    "import Prelude",
    "",
    "f :: Int -> Int",
    "f (Tuple a b) { x, y } [h] _ = a",
    "f t u",
    "  | t > u = 1",
    "  | otherwise = 2",
    "g = 1",
    "ff x = 1",
    "  where f = 2",
  ].join("\n");
  assert.deepEqual(clauseArities(code, "f"), [4, 2]);
  assert.deepEqual(clauseArities(code, "g"), [0]);
  assert.deepEqual(clauseArities(code, "h"), []);
  assert.deepEqual(clauseArities("f :: Int\nf = 1", "f"), [0]);
});

test("a placeholder or empty [purescript] table fails, naming what is wrong", async () => {
  for (const name of ["ps-placeholder", "ps-empty"]) {
    const { ok, failures } = await checkBank(fixture(name));
    assert.equal(ok, false, name);
    assert.deepEqual(failures[0].problems, [
      "purescript.signature is a placeholder or empty (every Puzzle needs a real Solution in every Language)",
      "purescript.reference is a placeholder or empty (every Puzzle needs a real Solution in every Language)",
    ]);
  }
});

test("a Solution that is only comments or blank lines is a placeholder; real code is not", async () => {
  const { isPlaceholder } = await import("../puzzle-check.js");
  for (const text of ["", "  \n", "-- placeholder until ticket 24", "-- a\n\n-- b\n", "// todo"]) assert.equal(isPlaceholder(text), true, text);
  for (const text of ["double :: Int -> Int", "x = 1 -- one", "function f() {}"]) assert.equal(isPlaceholder(text), false, text);
});

test("malformed TOML fails, naming the file", () => failsWith("malformed", /^Invalid TOML document: unfinished string/));
test("a missing required field fails", () => failsWith("missing-field", /^missing key: signature in \[javascript\]$/));
test("an unknown key fails, as in the build", () => failsWith("unknown-key", /^unexpected key: difficulty in <top-level>$/));
test("a date where a JSON value belongs fails, as in the build", () =>
  failsWith("date-value", /^tests\[0\]\.expected: dates and times aren't JSON values$/));
test("an empty list of tests fails", () => failsWith("empty-tests", /^tests must not be empty$/));

test("the build's other rules: types of the texts, args a list, tests' keys", () => {
  const base = `function = "f"\nprompt = "p"\n`;
  const tables = `\n[javascript]\nsignature = "f()"\nreference = "r"\n\n[purescript]\nsignature = "f"\nreference = "r"\n`;
  const problems = (text) => readPuzzle("f", text + tables).problems ?? [];
  assert.deepEqual(problems(base + `[[tests]]\nargs = []\nexpected = 1\n`), []);
  assert.deepEqual(readPuzzle("f", base + `[[tests]]\nargs = []\nexpected = 1\n` + tables.replace('"f()"', "3")).problems, [
    "javascript.signature must be a string",
  ]);
  assert.deepEqual(problems(base + `[[tests]]\nargs = 1\nexpected = 1\n`), ["tests[0].args must be a list"]);
  assert.deepEqual(problems(base + `[[tests]]\nargs = []\n`), ["missing key: expected in tests[0]"]);
  assert.deepEqual(problems(base + `[[tests]]\nargs = []\nexpected = 1\nnote = "x"\n`), [
    "unexpected key: note in tests[0]",
  ]);
  assert.deepEqual(problems(base + `[[tests]]\nargs = [nan]\nexpected = 1\n`), [
    "tests[0].args[0]: JSON has no NaN or infinity",
  ]);
  assert.deepEqual(problems(base + `tests = 3\n`), ["tests must be a list of [[tests]] tables"]);
});

test("length counts lines and characters after removing leading whitespace", () => {
  // Blank and whitespace-only lines don't count; indentation doesn't count;
  // line breaks aren't characters.
  assert.deepEqual(referenceLength("\n  ab\n\n\t  \n\tc d\n"), { lines: 2, chars: 5 });
  assert.deepEqual(referenceLength("a\r\nb"), { lines: 2, chars: 2 });
  // Trailing whitespace is counted: the rule removes only leading whitespace.
  assert.deepEqual(referenceLength("a  "), { lines: 1, chars: 3 });
  // Characters are code points, not UTF-16 units.
  assert.deepEqual(referenceLength("é😀"), { lines: 1, chars: 2 });
});

test("the length rule's bounds are inclusive", async () => {
  const { lengthProblems } = await import("../puzzle-check.js");
  const lines = (n, width) => Array.from({ length: n }, () => "x".repeat(width)).join("\n");
  assert.deepEqual(lengthProblems(lines(4, 25)), []); // 4 lines, 100 chars
  assert.deepEqual(lengthProblems(lines(12, 29) + "xx"), []); // 12 lines, 350 chars
  assert.equal(lengthProblems(lines(4, 25).slice(1)).length, 1); // 99 chars
  assert.equal(lengthProblems(lines(12, 29) + "xxx").length, 1); // 351 chars
});

test("the symbol report counts Reference Solutions containing a symbol and occurrences", () => {
  const counts = Object.fromEntries(symbolCounts(["a(b)(c)", "(", "x"]).map((c) => [c.symbol, c]));
  assert.deepEqual(counts["("], { symbol: "(", occurrences: 3, solutions: 2 });
  assert.deepEqual(counts["`"], { symbol: "`", occurrences: 0, solutions: 0 });
  assert.equal(Object.keys(counts).join(""), "{}[]()<>=!&|+-*/%'\"`$?:;,.");
});

test("the symbol tables are per Language, each from its own list, and PureScript's skips imports", () => {
  const ps = ["import Data.Array (cons)\nf = \\x -> x # g", "f = 1"];
  const counts = Object.fromEntries(symbolCounts(ps, purescript).map((c) => [c.symbol, c]));
  assert.deepEqual(counts["\\"], { symbol: "\\", occurrences: 1, solutions: 1 });
  assert.deepEqual(counts["#"], { symbol: "#", occurrences: 1, solutions: 1 });
  assert.deepEqual(counts["("], { symbol: "(", occurrences: 0, solutions: 0 }); // only in the import line
  assert.equal(counts["%"], undefined); // not a PureScript target symbol
  const report = symbolReports({ javascript: ["f(x)"], purescript: ps });
  assert.match(report, /Target symbols, javascript, over 1 Reference Solution\(s\)/);
  assert.match(report, /Target symbols, purescript, over 2 Reference Solution\(s\)/);
  assert.ok(report.indexOf("javascript") < report.indexOf("purescript"));
  assert.match(report, /<- in fewer than 5/);
});

test("the runner script gets the browser's request and sends its reply", async () => {
  const puzzle = { function: "inc", tests: [{ args: [1], expected: 2 }, { args: [[1, 2]], expected: "x" }] };
  const request = checkRequest(puzzle, "const inc = (n) => n + 1;");
  assert.deepEqual(JSON.parse(request), {
    code: "const inc = (n) => n + 1;",
    fn: "inc",
    tests: [{ args: [1], expected: 2 }, { args: [[1, 2]], expected: "x" }],
  });
  assert.deepEqual(await runCheck(request), {
    kind: "results",
    results: [{ pass: true, got: "2" }, { pass: false, got: '"1,21"' }],
  });
});

test("a result whose object keys aren't sorted passes against a sorted expected value", async () => {
  const { ok, failures } = await checkBank(fixture("unsorted-result"));
  assert.deepEqual(failures, []);
  assert.equal(ok, true);
});

test("a result that depends on the arguments' key order fails, as in the browser", async () => {
  // The file lists {b, a}; the app sends {a, b}, so Object.keys gives ["a","b"].
  const { ok, failures } = await checkBank(fixture("argument-key-order"));
  assert.equal(ok, false);
  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0].problems, ['test 1 failed: {"b":1,"a":2} → expected ["b","a"], got ["a","b"]']);
});

test("the request sends object keys sorted, arrays in order, as the app does", () => {
  const puzzle = { function: "f", tests: [{ args: [{ b: 1, a: { d: [{ y: 1, x: 2 }], c: 3 } }], expected: { z: 1, _: 2, B: 3 } }] };
  assert.equal(
    checkRequest(puzzle, ""),
    '{"code":"","fn":"f","tests":[{"args":[{"a":{"c":3,"d":[{"x":2,"y":1}]},"b":1}],"expected":{"B":3,"_":2,"z":1}}]}',
  );
});

test("the command passes on a sound folder and prints the symbol report", async () => {
  const { stdout } = await run(process.execPath, [join(here, "..", "check.js"), fixture("passing")]);
  assert.match(stdout, /OK: all \d+ Puzzle file\(s\) pass\./);
  assert.match(stdout, /Target symbols, javascript, over \d+ Reference Solution\(s\)/);
  assert.match(stdout, /Target symbols, purescript, over \d+ Reference Solution\(s\)/);
});

test("a Puzzle without a Language table fails, naming it", async () => {
  const text = readFileSync(join(fixture("passing"), "double.toml"), "utf8");
  const [beforeJs, afterJs] = text.split("\n[javascript]");
  const js = "\n[javascript]" + afterJs.split("\n[purescript]")[0];
  const ps = "\n[purescript]" + afterJs.split("\n[purescript]")[1];
  assert.deepEqual(readPuzzle("double", beforeJs + ps).problems, [
    "missing table: [javascript] (every Puzzle needs a Solution in every Language)",
  ]);
  assert.deepEqual(readPuzzle("double", beforeJs + js).problems, [
    "missing table: [purescript] (every Puzzle needs a Solution in every Language)",
  ]);
});

test("a Language table the build doesn't know fails, as in the build", () => {
  const text = readFileSync(join(fixture("passing"), "double.toml"), "utf8");
  assert.deepEqual(readPuzzle("double", text + '\n[ruby]\nsignature = "s"\nreference = "r"\n').problems, [
    "unexpected key: ruby in <top-level>",
  ]);
  assert.deepEqual(readPuzzle("double", text + 'difficulty = 3\n').problems, [
    "unexpected key: difficulty in [purescript]",
  ]);
});

test("the old shape, signature and reference at the top level, fails", () => {
  const text = readFileSync(join(fixture("passing"), "double.toml"), "utf8");
  assert.deepEqual(readPuzzle("double", 'signature = "double(x)"\nreference = "r"\n' + text).problems, [
    "unexpected key: signature in <top-level>",
    "unexpected key: reference in <top-level>",
  ]);
});

test("the command exits non-zero and names the failing file", async () => {
  await assert.rejects(run(process.execPath, [join(here, "..", "check.js"), fixture("failing-test")]), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /FAIL double\.toml \(Puzzle double\)\n  test 2 failed/);
    assert.match(err.stdout, /Target symbols, javascript, over 1 Reference Solution\(s\)/);
    return true;
  });
});
