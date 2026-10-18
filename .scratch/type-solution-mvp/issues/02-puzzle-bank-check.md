Status: ready-for-agent

# 02: Puzzle bank check

## What to build

One Node command a coding agent or CI runs to prove the Puzzle bank is sound. For every Puzzle file it runs the Reference Solution against the Puzzle's tests through the browser's own test-runner script, checks the Reference Solution's length, and prints how often each target symbol appears across the whole bank.

## Acceptance criteria

- [ ] One command (documented in the repo, e.g. an npm script) checks every file in the puzzles folder.
- [ ] It fails, naming the Puzzle and the failing test, if a Reference Solution fails any of its tests, crashes, or doesn't define the function.
- [ ] It runs the tests through the browser's test-runner script unchanged (same request and reply JSON), not a copy of its logic.
- [ ] It fails a Puzzle whose Reference Solution is outside 4–12 non-blank lines or 100–350 characters, counted with each line's leading whitespace removed.
- [ ] It fails, naming the file, on a malformed TOML file or one missing a required field.
- [ ] It prints, without ever failing on it, a count per target symbol over all Reference Solutions: `{}[]()<>=!&|+-*/%'"` `` ` `` `$?:;,.`, and marks symbols seen in fewer than 5.
- [ ] It passes on today's bank (fizzBuzz), adjusting fizzBuzz's Reference Solution only if it breaks the length rule.

## Blocked by

- 01: Puzzles come from TOML files at build time

## Notes for whoever implements it

- Source of the wider shape: `.scratch/type-solution/spec.md` (Puzzles section, Testing Decisions "Seam 3"). Rules from `.scratch/type-solution/issues/12-grilling-authoring-guide-launch-bank.md`.
- The point of using the runner script unchanged: a Puzzle that passes here passes in the browser. The runner is a worker script: it sets `self.onmessage` and calls `postMessage` with JSON text. Run it in Node by providing those two names (e.g. load it into a `vm` context or a `worker_threads` worker with a small shim), never by editing it for Node.
- The length rule is a hard failure; the symbol report is a report only. Coverage is judged over the whole bank, never per Puzzle.
- Because ticket 01 may fall back to parsing TOML at startup, this check is the guaranteed guard against a malformed file. CI (ticket 09) runs it before the build.
- The `static/editor` folder already has a Node package (esbuild, acorn, CodeMirror); reuse its tooling or give the check its own small package, whichever keeps the runner script the single source.
