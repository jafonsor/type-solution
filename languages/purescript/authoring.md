# PureScript: authoring Reference Solutions

Limits, symbols and timeouts are in `language.json` (the check enforces the limits): 4 to 30 non-blank lines, 100 to 900 characters, import lines left out of both counts (the editor inserts them). The signature's two lines are typed by the player and count. How a test calls the function: `calling-convention.md`.

**Imports.**
- One line each: `import M (a, b)`. No `qualified`, `hiding`, `as`, or wrapped lines; a Puzzle that needs more is rewritten.
- Only modules of the libraries pinned in `packages.json`, plus `Prim.*`. Every name imported must be exported by that module (the check verifies it from the library sources when they are available, see `tools/puzzle-check/README.md`).
- `import Prelude` is explicit, first.
- Where two modules export one name (`filter` in `Data.Array`, `Data.List`, `Foreign.Object`), `name-clashes.json` says which comes first; use that one unless the Puzzle needs the other.
- `Type.Proxy`, `Record.Unsafe` live in the `prelude` library; `RowToList` is `Prim.RowList`, `Union` and `Nub` are `Prim.Row`.

**Signature.** Two lines, as in the Puzzle file: the type, then `name params = ...`. Prefer plain types (`Array a`, `Int`, `String`); a Puzzle's tests fix what is possible (see `calling-convention.md`).

**Traps found by compiling.**
- A `where` binding is not in scope in the guards of the same clause (`f x | g = ... where g = ...` fails with "Unknown value g"); it is in scope in the guarded bodies. Use an `if`, or a top-level helper.
- `Data.Traversable.scanl` leaves out the start value, unlike `Data.Array`-style scans: a running total is `scanl plus 0 nums`.
- A Solution may define a name Prelude also exports (`gcd`); it is fine.
- Typed holes, `!!` and `;` rarely belong in a natural Solution; the symbol list leaves `! % ? ;` out and adds `\ _ #` (lambdas, wildcards and sections, the `#` pipe).
- `Eq` is the only constraint with a hand-supplied dictionary; an `Ord` or `Show` constraint sends the function down the typed path, whose tests must be plain records, arrays and scalars.

**Style.** Reach the symbol goal with natural PureScript: guards, `where`, lambdas, sections, `$`, `#`, `<>`, backticks, char and string quotes, records.

**Peeking.** Write the Reference Solution the way you would want to read it when stuck: plain names, one idea per line, no point-free tricks. A player reads it while typing.
