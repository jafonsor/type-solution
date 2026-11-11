Type: task
Status: resolved
Blocked by: none

# 22: The app reads per-Language tables in Puzzle files, and the files migrate

## What to build

`Puzzle.hs` (and `Common.Puzzle`) accept the known Language tables, `[javascript]` and `[purescript]`, each with `signature` and `reference`, and reject unknown names (spec, "Puzzle file"). Every Puzzle must have both. Migrate the 50 files in `puzzles/`: wrap `signature` and `reference` in `[javascript]`. Make puzzle-check's `readPuzzle` read the same shape (today it reads JavaScript at top level and `[purescript]` only; see ticket 21).

## Acceptance

- [x] The app builds with Puzzle files in the new shape; unknown Language tables and a missing table are build errors.
- [x] puzzle-check and the build parse the same files the same way; `npm test` and the Haskell tests cover both.
- [x] Until ticket 24 lands, PureScript tables in `puzzles/` may be placeholders that make the bank check fail; say so in the commit. Decide with the owner whether to land 22 and 23 to 24 together.

## Resolution

Landed alone, ahead of 23 and 24 (decided with the owner). The 50 `[purescript]` tables are placeholders (`-- placeholder until ticket 24`). The bank check still passes, because it judges only JavaScript Reference Solutions and the presence of the tables; `npm run solutions -- --lang=purescript` fails on every placeholder until ticket 24.
