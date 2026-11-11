Type: grilling
Status: resolved
Blocked by: none

# 18: How is the Puzzle bank authored and checked for a non-JavaScript Language?

## Question

Settled already: one Puzzle file with a table per Language ([ticket 04](04-grilling-puzzle-file-per-language.md)); puzzle-check compiles every PureScript Reference Solution with the wasm compiler ([ticket 13](13-grilling-compiler-bundle-build-and-deploy.md)); only the import line is inserted by autocomplete ([ticket 08](08-prototype-auto-import.md), [ticket 17](17-task-auto-import-in-codemirror.md)).

Decide what is still open for the bank:
- Where the library list file lives and who owns it.
- Symbol coverage per Language: what the coverage report counts and whether each Language has its own target.
- How the `write-puzzle` skill covers a second Language (one skill with a section per Language, or one per Language).
- How the import name table is generated from the bank, and whether Reference Solutions are limited to one-line imports (the auto-import merge handles only those).
- How the unverified PureScript sketches in ticket 04 get checked (puzzle-check run, or a one-off pass first).

## Answer

**Plain version.** Each Language gets its own folder under `languages/`; a single `write-puzzle` skill holds the shared rules and tells the author to read each shipped Language's folder. Puzzle-check reads the same folders, so the numbers live in one place.

**Decisions** (grilled with the player, 6 questions, all agreed):
- **Layout.** `languages/<name>/` per Language, JavaScript included (its length limits and symbol list move out of the skill and `tools/puzzle-check` into it). A PureScript folder holds: the pinned package list (read by the app build for the library files and by puzzle-check), the compiler patch from [ticket 13](13-grilling-compiler-bundle-build-and-deploy.md), a config (length limits, symbol list) that puzzle-check reads, the preference list for clashing names, and `authoring.md` (style advice, traps). A second Language adds a folder; the skill and the check do not change.
- **Symbol coverage.** Per Language: each has its own target list and its own table in the report; goal is every symbol in at least 5 of that Language's Reference Solutions; the report never fails the check. The exact PureScript list is left to the build, to tune once real Reference Solutions exist.
- **`write-puzzle`.** One skill, shared core (file format, identity, prompt, JSON values, easy, 3-6 tests) plus an instruction to read each shipped Language's folder. A Puzzle written after a Language ships must arrive with a Reference Solution in every shipped Language (ties to the map's Bank rule). Language-specific rules now in the skill that move out: "no imports" (PureScript needs one-line imports), the `Object.keys` key-order trap, length numbers, symbols and style advice, and the survey/check commands naming the per-Language report.
- **Imports.** Every PureScript Reference Solution uses only one-line imports (`import M (a, b)`; no `qualified`, `hiding`, `as`, wrapped lines), enforced by puzzle-check. A Puzzle needing more is rewritten, not exempted.
- **Name-to-module table.** Generated at build time from the exports of the pinned package list's library files (not only from the bank), with a small preference list for names two modules export (for example `filter` in `Data.Array` and `Data.List`), kept in the Language's folder.
- **Unchecked sketches.** No verification step on this map. The handoff spec makes "write and compile all 50 PureScript Reference Solutions" the first build step with puzzle-check as the judge, and names the risky Puzzles (`getPath` with `Json`, the 8 polymorphic-list and 4 mixed-value-object Puzzles from [ticket 02](02-research-purescript-json-tests.md), `queryString`, `withDefaults`). If a Puzzle cannot be typed in PureScript: change that Puzzle's tests for every Language, or hold PureScript back until fixed.
