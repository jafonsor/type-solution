// Self-tests for the Puzzle bank check. Each folder under fixtures/ holds one
// Puzzle file that passes or fails in exactly one way. The fixtures live here,
// not in puzzles/, because the build embeds every file there.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { checkBank, checkRequest, readPuzzle, referenceLength, runCheck, symbolCounts } from "../puzzle-check.js";

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
  failsWith("failing-test", /^test 2 failed: double\(-3\) expected 6, got -6$/));

test("a Reference Solution that throws in a test fails that test", () =>
  failsWith("crashing", /^test 1 failed: double\(2\) expected 4, got Error: this Reference Solution always crashes$/));

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

test("malformed TOML fails, naming the file", () => failsWith("malformed", /^Invalid TOML document: unfinished string/));
test("a missing required field fails", () => failsWith("missing-field", /^missing key: signature in <top-level>$/));
test("an unknown key fails, as in the build", () => failsWith("unknown-key", /^unexpected key: difficulty in <top-level>$/));
test("a date where a JSON value belongs fails, as in the build", () =>
  failsWith("date-value", /^tests\[0\]\.expected: dates and times aren't JSON values$/));
test("an empty list of tests fails", () => failsWith("empty-tests", /^tests must not be empty$/));

test("the build's other rules: types of the texts, args a list, tests' keys", () => {
  const base = `function = "f"\nsignature = "f()"\nprompt = "p"\nreference = "r"\n`;
  const problems = (text) => readPuzzle("f", text).problems ?? [];
  assert.deepEqual(problems(base + `[[tests]]\nargs = []\nexpected = 1\n`), []);
  assert.deepEqual(problems(base.replace('"f()"', "3") + `[[tests]]\nargs = []\nexpected = 1\n`), [
    "signature must be a string",
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
  assert.deepEqual(failures[0].problems, ['test 1 failed: keys({"b":1,"a":2}) expected ["b","a"], got ["a","b"]']);
});

test("the request sends object keys sorted, arrays in order, as the app does", () => {
  const puzzle = { function: "f", tests: [{ args: [{ b: 1, a: { d: [{ y: 1, x: 2 }], c: 3 } }], expected: { z: 1, _: 2, B: 3 } }] };
  assert.equal(
    checkRequest(puzzle, ""),
    '{"code":"","fn":"f","tests":[{"args":[{"a":{"c":3,"d":[{"x":2,"y":1}]},"b":1}],"expected":{"B":3,"_":2,"z":1}}]}',
  );
});

test("the command passes on today's bank and prints the symbol report", async () => {
  const { stdout } = await run(process.execPath, [join(here, "..", "check.js")]);
  assert.match(stdout, /OK: all \d+ Puzzle file\(s\) pass\./);
  assert.match(stdout, /Target symbols over \d+ Reference Solution\(s\)/);
});

test("the command exits non-zero and names the failing file", async () => {
  await assert.rejects(run(process.execPath, [join(here, "..", "check.js"), fixture("failing-test")]), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /FAIL double\.toml \(Puzzle double\)\n  test 2 failed/);
    assert.match(err.stdout, /Target symbols over 1 Reference Solution\(s\)/);
    return true;
  });
});
