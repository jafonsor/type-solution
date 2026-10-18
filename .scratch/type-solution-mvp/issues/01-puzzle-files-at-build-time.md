Status: ready-for-agent

# 01: Puzzles come from TOML files at build time

## What to build

The game still plays fizzBuzz, but the Puzzle now comes from a file: a top-level puzzles folder holds `fizzBuzz.toml`, and the app reads every file in it at build time. Each Puzzle gets an identity taken from its file name, and a passed Run's record stores that name. Adding a Puzzle means adding a file and rebuilding; a malformed file stops the build.

## Acceptance criteria

- [ ] A puzzles folder at the repo root holds `fizzBuzz.toml` with `function`, `signature`, `prompt`, `reference` and `[[tests]]` blocks (`args` a list, `expected` a value), matching today's fizzBuzz Puzzle and tests.
- [ ] A Template Haskell splice reads every `.toml` file in that folder and embeds the bank in the app. The hard-coded fizzBuzz value in the common Puzzle module is gone, and the frontend takes its Puzzle from the bank.
- [ ] The Puzzle type has an identity field (the file name without `.toml`) and a Reference Solution field.
- [ ] A passed Run's saved record names the Puzzle by its identity, not its function name.
- [ ] Records already in browser storage (with the function name under `puzzle`) still decode.
- [ ] A malformed Puzzle file fails the build with a message naming the file (if TOML is parsed in the splice; see notes).
- [ ] The common test suite passes, updated for the new Puzzle shape; the fizzBuzz Run still plays end to end in `ob-run`.

## Blocked by

None (can start immediately).

## Notes for whoever implements it

- Source of the wider shape: the MVP spec, `.scratch/type-solution/spec.md`. Format decided in `.scratch/type-solution/issues/05-grilling-puzzle-format.md` (TOML chosen over JSON, YAML and Markdown; it has a worked example file).
- **Identity is the file name**, not the function name: two Puzzles may share a function name. Runs and Personal bests key on the identity. Naming the file after the function is only a guideline.
- Prefer `toml-parser` (pure Haskell, TOML 1.0) and parse inside the splice, so a broken file is a build error. First confirm it's in the pinned package set and builds for wasm32-wasi-ghc 9.14 (a splice reading a file was tested on that compiler; a splice using `toml-parser` wasn't). If it isn't available, embed the text and parse at startup; then the Puzzle bank check (ticket 02) is what stops a broken file.
- TOML has no `null`; no Puzzle takes or returns `null`. Values become aeson `Value`s, because the test-runner worker compares results as JSON.
- The Reference Solution and the tests are in the bundle (the worker needs the tests), but nothing may render either (Design Contract I1). A failed test may show its call, expected value and what the Solution returned, as it does now.
- The record's JSON key `puzzle` stays; only its content changes to the identity. fizzBuzz's old records keep matching because both names are `fizzBuzz`.
- Puzzle choice stays fixed on the one Puzzle here; random choice is ticket 05.
- Domain words from `CONTEXT.md`: Puzzle, Reference Solution, Run, Solution.
