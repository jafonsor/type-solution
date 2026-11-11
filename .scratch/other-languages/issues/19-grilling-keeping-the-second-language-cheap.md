Type: grilling
Status: resolved
Blocked by: none

# 19: What must the PureScript spec keep generic so a second Language is cheap?

## Question

Walk the decisions on this map (Puzzle file tables, compiler bundle, check timing and errors, editor mode, auto-import, saved data, Personal bests) and mark, for each, what is PureScript-specific and what is Language-neutral. Decide the seams the spec must name (for example: a Language's compiler bundle, its editor mode, its import rules, its signature format) and what a "second Language" checklist would contain. Do not pick the second Language.

## Answer

**Plain version.** Most of the app does not care which Language is picked. A new Language has to supply four things, and the spec names them so adding one touches nothing else.

**Same for every Language:** dropdown and drafts, Run clock, Personal best per Puzzle and Language, key presses, peeking, saved-data layout, the 400 ms pause, status-line errors and the "Loading…" line, lazy download with cache, the Puzzle file shape (a table per Language), the autocomplete popup.

**PureScript only:** the compiler and its patch, the pinned package list, the Haskell-style editor wrapper, the two-line typed signature, one-line import format, the name-to-module table, curried calling style.

**Decisions** (grilled with the player, 6 questions, all agreed):
- **Four seams.** (a) Checker: typed code plus a Puzzle's tests in, pass, fail or readable error out. (b) Editor mode. (c) Import rules (optional). (d) Bank folder `languages/<name>/` ([ticket 18](18-grilling-bank-authoring-for-a-language.md)). Everything else is shared app behaviour.
- **JavaScript is the first Language** in the same terms; the build refactors it behind the seams while adding PureScript, so there is never a second code path.
- **Calling convention** is part of the Checker: how a test's JSON `args`/`expected` become a call and a comparison, a per-Language rule documented in its folder. Tests stay one JSON set.
- **Per Language (in its config):** length limits and compile timeout. **Global:** the 400 ms pause and the underline toggle.
- **Import rules optional.** Without them no popup appears; the "one-line imports only" bank rule applies only to Languages that have imports.
- **Second-Language checklist:** (1) browser-only Checker in a worker, no server; (2) lazy-loadable bundle with a pinned build recipe; (3) Editor mode; (4) Import rules or explicit "none"; (5) `languages/<name>/` folder; (6) Reference Solution and signature for every Puzzle; (7) calling-convention note; (8) puzzle-check compiles every Reference Solution. "Cheap" = no change to the dropdown, saved data, Run, Personal best or Puzzle file format. A Language that needs a server is out of scope, not a harder checklist.
