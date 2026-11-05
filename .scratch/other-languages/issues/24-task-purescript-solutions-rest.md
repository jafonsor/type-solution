Type: task
Status: resolved
Blocked by: 23

# 24: Write the remaining PureScript Reference Solutions

## What to build

The other Puzzles (the 31 plain ones and the 7 `Object a` ones, minus any done in ticket 23). Use the `write-puzzle` skill's style rules adapted to PureScript, one-line imports only. Tune the PureScript symbol list and length limits from the real Solutions (spec, "Bank").

## Acceptance

- [x] All 50 Puzzles have a `[purescript]` table; `npm run check` and `npm run solutions` pass (with `PURS_WASM` set).
- [x] The symbol coverage table per Language is printed and the goal (5 Solutions per symbol) is met or the gaps are reported.

## Comments

Done. All 50 Puzzles have a real `[purescript]` table (38 written here); `npm run check` and `npm run solutions` pass with `PURS_WASM` and `PURS_LIBS` set (100 of 100 Solutions, about 90 s warm).

- **Puzzle-check changes** (`tools/puzzle-check/puzzle-check.js`): a table text that is empty or only `--`/`//` comments fails the bank check (`purescript.reference is a placeholder or empty ...`); PureScript Reference Solutions are held to 4-30 non-blank lines and 100-900 characters with import lines excluded (JavaScript keeps 4-12 and 100-350); the symbol table is printed per Language, each Language with its own list (`targetSymbols`). Tests: `test/check.test.js` with fixtures `ps-too-few-lines`, `ps-too-many-lines`, `ps-too-few-chars`, `ps-too-many-chars`, `ps-placeholder`, `ps-empty`. The bank check still does not run the compiler.
- **PureScript symbol list** (tuned from the real Solutions): the JavaScript list without `! % ? ;` (no natural use: `mod` is a word, `!` and `?` exist only as `!!` and typed holes, `;` is not used with layout) and with `\`, `_` and `#`. It sits beside JavaScript's in `puzzle-check.js`; ticket 25 moves both into `languages/<name>/`. Coverage over the 50 Solutions: every symbol is in at least 5 Solutions, no gaps (lowest: `{` `}` 5, `/` 5, `'` 5, `#` 5).
- **Libraries:** nothing beyond the pinned 40. Modules imported by the 38: `Data.Array`, `Data.Enum`, `Data.Foldable`, `Data.Int`, `Data.Maybe`, `Data.String`, `Data.String.CodeUnits`, `Data.String.Common`, `Data.Traversable`, `Foreign.Object`. No new library to fetch for ticket 25.
- **Authoring trap for `languages/purescript/authoring.md`:** a `where` binding is not in scope in the guards of the same clause (`f x | g = ... where g = ...` fails with "Unknown value g"); it is in scope in the guarded bodies. `maskCard` and `rockPaperScissors` were rewritten for it (an `if` and a top-level helper). Also: a Solution that defines a Prelude name (`gcd`) is fine; `Data.Traversable.scanl` leaves out the start value (unlike `Data.Array`-style scans), so `runningTotal` is just `scanl plus 0 nums`.
- No Puzzle was left untyped; no test was changed.
