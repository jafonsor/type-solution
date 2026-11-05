Type: task
Status: ready-for-agent
Blocked by: the Nix-built `purs-core.wasm` (spec Build order, step 3). Until it exists, point `PURS_WASM` at the ticket 10 artifact to develop against.

# 21: puzzle-check compiles PureScript Reference Solutions with the wasm compiler, in Node

## What to build

A PureScript runner for `tools/puzzle-check/run-solutions.js` (`npm run solutions`), and for the bank check that shares it. It compiles a Reference Solution with the same `purs-core.wasm` the browser downloads, then runs the generated JavaScript against the Puzzle's tests.

## Decisions (made with the owner)

- **Wasm compiler, not a native `purs`.** The check must see what the browser sees, which also guards against the GHC 9.14 version drift (spec, "Reference Solution check").
- **Run it in Node**, through WASI, as `research/10-purs-wasm/run.mjs` does. No browser in the check. One small browser smoke test using `research/11-browser-worker/` may come later; it is not part of this ticket.
- **Plug in through the `runners` registry** in `run-solutions.js`: a runner is a function from `(puzzle, code, options)` to a list of problems. `solutionsOf` starts reading the `[purescript]` table once Puzzle files have per-Language tables (spec, "Puzzle file").

## Steps

1. **Find the compiler.** `PURS_WASM=/path/to/purs-core.wasm`. If unset, every PureScript row fails with "no compiler configured for purescript"; nothing passes silently.
2. **Work folder.** A temp folder seen by the compiler as `/w`, holding the pinned library sources and cached externs (the layout in `research/11-browser-worker/`). Build it once per run, not per Puzzle.
3. **Compile.** Write `Main.purs` fresh each time (the compiler checks modified times, so an edit must change them), run the wasm with `returnOnExit`, and use a fresh instance per check on a persistent file tree. Exit 1 is a compile error: strip ANSI colour codes, report the first error with its line and column. Syntax errors report the line after the break (spec, "Check behaviour").
4. **Run.** Write the generated modules to disk and `import()` them. Call the function with the PureScript calling convention (curried arguments; `Tuple` converted back to JSON pairs; see spec, "Calling convention"). Same pass rule (keys sorted) and 1 s timeout as the JavaScript runner; reuse `runner.js` where its comparison can be shared.
5. **Speed.** Keep the file tree between Puzzles. A cold compile of Prelude is about 3.4 s; a warm check is 0.2 to 0.4 s, so 50 Puzzles should take about 20 s.
6. **Lint while there.** Fail a Solution that imports a library not on the pinned list, and one using anything but one-line imports (spec, "Bank").

## Acceptance

- `npm run solutions` shows a `purescript` row per Puzzle that has a PureScript Reference Solution, and exits 1 on any compile error or failing test.
- A type error and a syntax error each give a readable one-line message with line and column.
- Tests in `tools/puzzle-check/test/` cover: a passing PureScript fixture, a type error, a syntax error, a failing test, and a missing `PURS_WASM`. Fixtures stay out of `puzzles/`.
- Proven first on one hand-written Solution (`clamp`) before the 50 are written.

## Not covered here

Writing the 50 PureScript Reference Solutions (Build order, step 1), the `[javascript]` migration of Puzzle files (step 2), and building the wasm in Nix (step 3).
