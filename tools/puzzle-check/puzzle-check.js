// The Puzzle bank check. For every Puzzle file in a folder it:
//   - reads the file with the same rules as the build (Common.Puzzle.parsePuzzle),
//   - runs the Reference Solution against the Puzzle's tests through the
//     browser's own test-runner script (static/src/js/runner.js), unchanged,
//   - checks the Reference Solution's length,
// and reports how often each target symbol appears across all Reference
// Solutions (a report only, never a failure).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { parse as parseToml } from "smol-toml";

const here = dirname(fileURLToPath(import.meta.url));
export const defaultPuzzlesDir = resolve(here, "../../puzzles");
export const defaultRunnerPath = resolve(here, "../../static/src/js/runner.js");

// Like the browser's check timeout (frontend/src/Frontend/Run.hs, checkTimeout).
export const timeoutMs = 1000;

// * Reading a Puzzle file

const puzzleKeys = ["function", "signature", "prompt", "reference", "tests"];
const testKeys = ["args", "expected"];

const isTable = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

// Missing and unknown keys, as the build's parser reports them.
function keyProblems(table, keys, where) {
  const missing = keys.filter((k) => !(k in table)).map((k) => `missing key: ${k} in ${where}`);
  const unknown = Object.keys(table)
    .filter((k) => !keys.includes(k))
    .map((k) => `unexpected key: ${k} in ${where}`);
  return [...missing, ...unknown];
}

// Problems with a TOML value used as a JSON value (TOML has no null; JSON has
// no dates, NaN or infinity).
function jsonProblems(v, where) {
  if (v instanceof Date) return [`${where}: dates and times aren't JSON values`];
  if (typeof v === "number" && !Number.isFinite(v)) return [`${where}: JSON has no NaN or infinity`];
  if (Array.isArray(v)) return v.flatMap((x, i) => jsonProblems(x, `${where}[${i}]`));
  if (isTable(v)) return Object.entries(v).flatMap(([k, x]) => jsonProblems(x, `${where}.${k}`));
  return [];
}

// Reads a Puzzle file's text. Returns {puzzle} or {problems: [message]}.
// Matches the build's rules: the five keys are required, no other key is
// allowed, the four texts are strings, `tests` is a list of tables each with
// exactly `args` (a list) and `expected`, all JSON values. Stricter than the
// build in one way: `tests` must not be empty (a Puzzle nobody can fail
// proves nothing).
export function readPuzzle(identity, text) {
  let doc;
  try {
    doc = parseToml(text);
  } catch (err) {
    return { problems: [String(err.message ?? err).trim()] };
  }
  const problems = keyProblems(doc, puzzleKeys, "<top-level>");
  for (const k of ["function", "signature", "prompt", "reference"]) {
    if (k in doc && typeof doc[k] !== "string") problems.push(`${k} must be a string`);
  }
  if ("tests" in doc) {
    if (!Array.isArray(doc.tests)) {
      problems.push("tests must be a list of [[tests]] tables");
    } else if (doc.tests.length === 0) {
      problems.push("tests must not be empty");
    } else {
      doc.tests.forEach((t, i) => {
        const where = `tests[${i}]`;
        if (!isTable(t)) {
          problems.push(`${where} must be a table with args and expected`);
          return;
        }
        problems.push(...keyProblems(t, testKeys, where));
        if ("args" in t && !Array.isArray(t.args)) problems.push(`${where}.args must be a list`);
        problems.push(...jsonProblems(t.args, `${where}.args`));
        problems.push(...jsonProblems(t.expected, `${where}.expected`));
      });
    }
  }
  if (problems.length > 0) return { problems };
  return {
    puzzle: {
      identity,
      function: doc.function,
      signature: doc.signature,
      prompt: doc.prompt,
      reference: doc.reference,
      tests: doc.tests.map((t) => ({ args: t.args, expected: t.expected })),
    },
  };
}

// * Length

export const lengthRule = { minLines: 4, maxLines: 12, minChars: 100, maxChars: 350 };

// How long a Reference Solution is, as the player types it. Each line has its
// leading whitespace (spaces, tabs) removed, since the editor auto-indents;
// lines left empty are not counted. `lines` is the number of lines left;
// `chars` is the number of characters (Unicode code points) on them. Line
// breaks are not characters here: they are counted by `lines`. Trailing
// whitespace on a line is counted, as the rule removes only leading
// whitespace.
export function referenceLength(reference) {
  const kept = reference
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s+/, ""))
    .filter((line) => line !== "");
  return { lines: kept.length, chars: kept.reduce((n, line) => n + [...line].length, 0) };
}

export function lengthProblems(reference) {
  const { lines, chars } = referenceLength(reference);
  const r = lengthRule;
  const problems = [];
  if (lines < r.minLines || lines > r.maxLines) {
    problems.push(`Reference Solution has ${lines} non-blank lines; it must have ${r.minLines}–${r.maxLines}`);
  }
  if (chars < r.minChars || chars > r.maxChars) {
    problems.push(
      `Reference Solution has ${chars} characters (leading whitespace and line breaks not counted); ` +
        `it must have ${r.minChars}–${r.maxChars}`,
    );
  }
  return problems;
}

// * Running the tests

// The request the browser sends (Common.Run.checkRequest).
export const checkRequest = (puzzle, code) =>
  JSON.stringify({
    code,
    fn: puzzle.function,
    tests: puzzle.tests.map((t) => ({ args: t.args, expected: t.expected })),
  });

// Runs one request through the runner script in a fresh worker, as the
// browser does. Resolves to the runner's parsed reply, or to
// {kind: "timeout"} if it doesn't reply within `timeoutMs` of getting the
// request, or {kind: "error", message} if the worker itself fails.
export function runCheck(request, { runnerPath = defaultRunnerPath, timeout = timeoutMs } = {}) {
  return new Promise((resolvePromise) => {
    const worker = new Worker(join(here, "runner-host.js"), { workerData: { runnerPath } });
    let timer;
    const finish = (result) => {
      clearTimeout(timer);
      worker.terminate();
      resolvePromise(result);
    };
    worker.on("message", (m) => {
      if (typeof m !== "string") {
        // The runner is loaded: send the request and start the clock.
        timer = setTimeout(() => finish({ kind: "timeout" }), timeout);
        worker.postMessage(request);
        return;
      }
      try {
        finish(JSON.parse(m));
      } catch {
        finish({ kind: "error", message: `the test runner sent an unreadable reply: ${m}` });
      }
    });
    worker.on("error", (err) => finish({ kind: "error", message: `the test runner failed: ${err}` }));
    worker.on("exit", (code) => finish({ kind: "error", message: `the test runner exited (${code})` }));
  });
}

// How a test's call reads, e.g. fizzBuzz(10) (Common.Puzzle.callText).
const callText = (puzzle, test) => `${puzzle.function}(${test.args.map((a) => JSON.stringify(a)).join(", ")})`;

// Runs the Reference Solution against the Puzzle's tests; returns problems.
export async function testProblems(puzzle, options) {
  const reply = await runCheck(checkRequest(puzzle, puzzle.reference), options);
  if (reply.kind === "timeout") return [`Reference Solution timed out (over ${options?.timeout ?? timeoutMs} ms)`];
  if (reply.kind === "error") return [`Reference Solution crashed: ${reply.message}`];
  if (reply.kind !== "results" || !Array.isArray(reply.results) || reply.results.length !== puzzle.tests.length) {
    return [`the test runner sent an unexpected reply: ${JSON.stringify(reply)}`];
  }
  return puzzle.tests.flatMap((t, i) =>
    reply.results[i].pass
      ? []
      : [`test ${i + 1} failed: ${callText(puzzle, t)} expected ${JSON.stringify(t.expected)}, got ${reply.results[i].got}`],
  );
}

// * Symbols

export const targetSymbols = [..."{}[]()<>=!&|+-*/%'\"`$?:;,."];
export const coverageGoal = 5;

// For each target symbol: how many times it appears over all Reference
// Solutions (`occurrences`) and in how many Reference Solutions
// (`solutions`). The coverage goal is judged on `solutions`.
export function symbolCounts(references) {
  return targetSymbols.map((symbol) => {
    const perSolution = references.map((r) => r.split(symbol).length - 1);
    return {
      symbol,
      occurrences: perSolution.reduce((a, b) => a + b, 0),
      solutions: perSolution.filter((n) => n > 0).length,
    };
  });
}

export function symbolReport(references) {
  const rows = symbolCounts(references).map(({ symbol, occurrences, solutions }) => {
    const mark = solutions < coverageGoal ? `  <- in fewer than ${coverageGoal}` : "";
    return `  ${symbol}    ${String(solutions).padStart(9)}  ${String(occurrences).padStart(11)}${mark}`;
  });
  return [
    `Target symbols over ${references.length} Reference Solution(s) (a report, never a failure):`,
    "  sym  solutions  occurrences   (solutions: Reference Solutions containing it)",
    ...rows,
  ].join("\n");
}

// * The whole bank

// Checks every .toml file in the folder. Resolves to {ok, failures, report}:
// `failures` is [{file, identity, problems}] for each failing Puzzle file;
// `report` is the symbol report over the Puzzles that could be read.
export async function checkBank(dir = defaultPuzzlesDir, options) {
  const names = readdirSync(dir)
    .filter((n) => extname(n) === ".toml")
    .sort();
  const failures = [];
  const references = [];
  if (names.length === 0) failures.push({ file: dir, identity: null, problems: ["There are no Puzzle files."] });
  for (const name of names) {
    const identity = name.slice(0, -".toml".length);
    const { puzzle, problems } = readPuzzle(identity, readFileSync(join(dir, name), "utf8"));
    if (!puzzle) {
      failures.push({ file: name, identity, problems });
      continue;
    }
    references.push(puzzle.reference);
    const found = [...lengthProblems(puzzle.reference), ...(await testProblems(puzzle, options))];
    if (found.length > 0) failures.push({ file: name, identity, problems: found });
  }
  return { ok: failures.length === 0, checked: names.length, failures, report: symbolReport(references) };
}
