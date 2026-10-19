Status: ready-for-agent

# 02: Puzzle bank check

## What to build

One Node command a coding agent or CI runs to prove the Puzzle bank is sound. For every Puzzle file it runs the Reference Solution against the Puzzle's tests through the browser's own test-runner script, checks the Reference Solution's length, and prints how often each target symbol appears across the whole bank.

## Acceptance criteria

- [x] One command (documented in the repo, e.g. an npm script) checks every file in the puzzles folder.
- [x] It fails, naming the Puzzle and the failing test, if a Reference Solution fails any of its tests, crashes, or doesn't define the function.
- [x] It runs the tests through the browser's test-runner script unchanged (same request and reply JSON), not a copy of its logic.
- [x] It fails a Puzzle whose Reference Solution is outside 4–12 non-blank lines or 100–350 characters, counted with each line's leading whitespace removed.
- [x] It fails, naming the file, on a malformed TOML file or one missing a required field.
- [x] It prints, without ever failing on it, a count per target symbol over all Reference Solutions: `{}[]()<>=!&|+-*/%'"` `` ` `` `$?:;,.`, and marks symbols seen in fewer than 5.
- [x] It passes on today's bank (fizzBuzz), adjusting fizzBuzz's Reference Solution only if it breaks the length rule.

## Blocked by

- 01: Puzzles come from TOML files at build time

## Notes for whoever implements it

- Source of the wider shape: `.scratch/type-solution/spec.md` (Puzzles section, Testing Decisions "Seam 3"). Rules from `.scratch/type-solution/issues/12-grilling-authoring-guide-launch-bank.md`.
- The point of using the runner script unchanged: a Puzzle that passes here passes in the browser. The runner is a worker script: it sets `self.onmessage` and calls `postMessage` with JSON text. Run it in Node by providing those two names (e.g. load it into a `vm` context or a `worker_threads` worker with a small shim), never by editing it for Node.
- The length rule is a hard failure; the symbol report is a report only. Coverage is judged over the whole bank, never per Puzzle.
- Because ticket 01 may fall back to parsing TOML at startup, this check is the guaranteed guard against a malformed file. CI (ticket 09) runs it before the build.
- The `static/editor` folder already has a Node package (esbuild, acorn, CodeMirror); reuse its tooling or give the check its own small package, whichever keeps the runner script the single source.

## Comments

Decisions made while building it:

- **Where it lives: its own small package, `tools/puzzle-check/`**, not `static/editor`, so the editor's `npmDepsHash` in `static/default.nix` is untouched. The command, from the repo root: `npm ci --prefix tools/puzzle-check && npm run check --prefix tools/puzzle-check` (exit 1 on any failure; `node check.js <folder>` checks another folder). Documented in `tools/puzzle-check/README.md` and a short section in `AGENTS.md`. The lockfile is committed.
- **The runner, unchanged.** `runner-host.js` is a `worker_threads` worker that defines `self` and `postMessage`, imports `static/src/js/runner.js`'s text as an ES module (a `data:` URL, as the browser runs it as a module worker), and calls `self.onmessage({data})` with the request. Each Reference Solution gets a fresh worker, the request is `Common.Run.checkRequest`'s shape (`{code, fn, tests: [{args, expected}]}`), the reply is the runner's JSON, and the worker is terminated after 1 s (the browser's `checkTimeout`). The clock starts once the runner has loaded, so a slow worker start isn't a timeout.
- **What fails.** A failed test: `test 2 failed: double(-3) expected 6, got -6` (the call as `callText` writes it). A Solution that throws inside a test is that test failing (the runner reports it as `got: "Error: ..."`); one that throws before any test, or doesn't define the function, is `Reference Solution crashed: <message>`; an endless loop is `Reference Solution timed out`.
- **Characters are counted** as Unicode code points on the non-blank lines after each line's leading whitespace (spaces, tabs) is removed. Line breaks are not characters (the line rule counts lines). Trailing whitespace is counted, since the rule removes only leading whitespace. Bounds are inclusive: 4–12 lines, 100–350 characters. Today's fizzBuzz: 6 lines, 138 characters, so it is unchanged.
- **The symbol report** prints, per target symbol, both the number of Reference Solutions containing it and its occurrences over all of them; the "fewer than 5" mark is on the first, as the coverage goal is "in at least 5 Reference Solutions". Symbols are counted in the Reference Solution's whole text (comments and strings included), and `===` counts as three `=`.
- **TOML: `smol-toml` 1.9.0**, pinned exactly (TOML 1.0). The file rules copy `parsePuzzle`'s: the five keys required, any other key rejected (top level and in each test), the four texts strings, `tests` a list of tables with exactly `args` (a list) and `expected`, no dates, NaN or infinity. Checked against the Haskell parser on the same inputs (unknown test key, non-string signature, `nan` in args, nested inline table): the same verdicts. Two places the check is stricter than the build: `tests` must not be empty (the build accepts `tests = []`), and an integer outside JavaScript's safe range is a TOML error in `smol-toml` (the build would take it, but the browser couldn't compare it exactly anyway).
- **Self-tests**: `npm test --prefix tools/puzzle-check` (`node --test`, 22 tests), on one-file Puzzle folders in `tools/puzzle-check/test/fixtures/` (outside `puzzles/`): passing, failing-test, crashing, crashing-on-load, no-function, endless-loop, too-few-lines, too-many-lines, too-few-chars, too-many-chars, malformed, missing-field, unknown-key, date-value, empty-tests.

Closed on branch `type-solution-mvp` by the commit "Ticket 02: Puzzle bank check". Status is left for the maintainer.

Review evidence: `npm run check --prefix tools/puzzle-check` gives "OK: all 1 Puzzle file(s) pass." (exit 0), and `npm test` passes 22/22. To show the check really goes through `runner.js`, I changed runner.js so that every test passes. Three self-tests then failed ("…failing a test fails, naming the test", "the runner script gets the browser's request…", "the command exits non-zero…"). I then restored runner.js. One difference from the build: the check rejects `tests = []` but `parsePuzzle` accepts it. That's harmless, because CI runs the check before the build. It's left for the final review to decide.
