Status: ready-for-agent

# 01: Puzzles come from TOML files at build time

## What to build

The game still plays fizzBuzz, but the Puzzle now comes from a file: a top-level puzzles folder holds `fizzBuzz.toml`, and the app reads every file in it at build time. Each Puzzle gets an identity taken from its file name, and a passed Run's record stores that name. Adding a Puzzle means adding a file and rebuilding; a malformed file stops the build.

## Acceptance criteria

- [x] A puzzles folder at the repo root holds `fizzBuzz.toml` with `function`, `signature`, `prompt`, `reference` and `[[tests]]` blocks (`args` a list, `expected` a value), matching today's fizzBuzz Puzzle and tests.
- [x] A Template Haskell splice reads every `.toml` file in that folder and embeds the bank in the app. The hard-coded fizzBuzz value in the common Puzzle module is gone, and the frontend takes its Puzzle from the bank.
- [x] The Puzzle type has an identity field (the file name without `.toml`) and a Reference Solution field.
- [x] A passed Run's saved record names the Puzzle by its identity, not its function name.
- [x] Records already in browser storage (with the function name under `puzzle`) still decode.
- [x] A malformed Puzzle file fails the build with a message naming the file (if TOML is parsed in the splice; see notes).
- [x] The common test suite passes, updated for the new Puzzle shape; the fizzBuzz Run still plays end to end in `ob-run`.

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

## Comments

Decisions made while building it:

- **TOML is parsed in the splice, with `toml-parser` 2.0.2.0.** It is in the pinned package set and builds for wasm32-wasi-ghc 9.14 in `nix build`, so a broken Puzzle file is a build error, e.g. `Puzzle file broken.toml is malformed: 2:10: lexical error: unterminated multi-line basic string`. A missing key (`1:1: missing key: signature in <top-level>`) and an unknown key (`unexpected key: difficulty ...`) fail the same way.
- **Where the code lives.** `Common.Puzzle` has the type, the file parser (`parsePuzzle`, `parseBank`, unit-tested) and the splice (`embedBank`); `Common.Bank` runs the splice and exports `bank :: NonEmpty Puzzle` (sorted by identity; an empty folder fails the build) and `lookupPuzzle`. The frontend asks for `fizzBuzz` by identity, falling back to the bank's first Puzzle, until ticket 05 chooses at random.
- **Where the folder is found.** The splice reads `getPackageRoot </> ".." </> "puzzles"`, i.e. the repo-root `puzzles/` seen from `common/`, whichever directory GHC runs in. `common.cabal` lists `extra-source-files: ../puzzles/*.toml`: haskell.nix copies only the files a package names into its source in the store, and it normalises this path to `puzzles/*.toml`, so the folder is there in `nix build`. Cabal warns (`relative-path-outside`: it wouldn't survive `sdist`); we never sdist.
- **Rebuilds.** Each file read is an `addDependentFile`, and cabal watches the listed files, so editing a Puzzle rebuilds. Neither GHC nor cabal notices a *new* file in the folder: cabal fixes its file list when it plans the build. So `Common.Bank` carries `-fforce-recomp`: it reruns the splice whenever its package is rebuilt for any reason. After adding a Puzzle file in a dev build, remove common's build record (`rm dist-newstyle/build/*/*/common-*/cache/build`) or change the content of a common module; a `touch` is not enough, since cabal compares contents, not times (found in ticket 04); `nix build` starts clean but builds the flake's git source, so it sees only files git tracks: `git add` a new Puzzle file before `nix build`, or production silently misses it (found in ticket 03).
- **Record field.** `RunRecord.puzzleFunction` became `puzzleIdentity`; the JSON key stays `puzzle`. A new `FromJSON RunRecord` reads today's stored shape (`puzzle, finishedAt, seconds, wordsPerMinute, backspaces, solution`); nothing reads records yet (tickets 07/08 will).

Closed on branch `type-solution-mvp` by the commit "Ticket 01: Puzzles come from TOML files at build time". Status is left for the maintainer (the triage labels have no done state).

Review evidence:

- `cabal test common`: 36/36 pass. The forced `-Werror` build of common, frontend and backend (which also builds the wasm frontend) passes. `nix build` passes, with `toml-parser` built for wasm32.
- Breaking `runRecord` on purpose to store the function name fails "a passed Run's record names the Puzzle by its identity, not its function" (got `fizzBuzz`, expected `fizzBuzzAgain`).
- A broken file fails the build: `Puzzle file broken.toml is malformed: 2:10: lexical error: unterminated multi-line basic string`. An unknown key: `Puzzle file extra.toml is malformed: 5:1: unexpected key: difficulty in <top-level>`.
- Measured: in a cabal dev build, a newly added file isn't seen (`Up to date`), and a `touch` of `Common/Bank.hs` doesn't change that (measured in ticket 04; this review first wrongly credited the touch). Changing a common module's content, or removing common's build record, does. `nix build` starts clean, but sees a new file only once git tracks it (`git add` first; found in ticket 03).
- Smoke test (`ob-run`, headless Chrome): fizzBuzz loads from its file and a typed Solution passes. The saved record has `"puzzle":"fizzBuzz"`, the console shows no errors, and the Reference Solution doesn't appear outside the editor.
