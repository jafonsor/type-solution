Type: task
Status: resolved
Blocked by: 22

# 25: `languages/<name>/` folders and puzzle-check reading them

## What to build

Bank section of the spec. Create `languages/javascript/` and `languages/purescript/`: length limits, symbol list, compile timeout, calling-convention notes, and for PureScript the pinned package list (one package-set release), the compiler patch reference, the name-clash preference list and `authoring.md`. puzzle-check reads these folders (limits, symbols, per-Language coverage table, the pinned list instead of `PURS_LIBS`), lints prompts for Language-specific call syntax, and checks every symbol is in the name table. Update the `write-puzzle` skill: shared core plus an instruction to read each Language's folder; move the Language-specific rules out.

## Acceptance

- [x] Adding a third Language folder needs no change to the skill or the check.
- [x] puzzle-check fails a Solution that imports a library off the pinned list, from the committed file, without environment variables for the list (`PURS_WASM` stays).

## Comments

Done. `languages/javascript/` and `languages/purescript/` hold `language.json` (limits, symbols, import pattern, timeouts), `calling-convention.md`, `authoring.md`; PureScript also `packages.json` (package set `psc-0.15.16-20261104`, 40 libraries with version, repo, commit and module names), `name-clashes.json` (102 names two everyday modules export as different things, derived by script from the pinned export lists, preferred module first) and, in `language.json`, a reference to the compiler patch (`research/10-purs-wasm/purescript.patch`; ticket 27 moves it).

- **puzzle-check** (`tools/puzzle-check/languages.js` loads the folders; `purs-imports.js`, `purs-exports.js`): limits, symbols, coverage tables, import lines and timeouts all come from the folders; a third folder needs no change (test: `test/languages.test.js`). The pinned list is the committed `packages.json`; `PURS_LIBS` now only says where the library sources are (compile, and the name check). Unset, the bank check still checks one-line imports and modules from the committed file and prints a `Note:` that names were not checked.
- **Prompt lint** flags call syntax; 49 of the 50 real prompts had `name(args) → result`, so they were rewritten to `args → result` (nothing else changed; `fizzBuzz` had none).
- **Name check** reads export lists from the sources without a compiler; members of `T(..)`/`T(A, B)` in an import list are not checked.
