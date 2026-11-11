Type: task
Status: resolved

# 39: The import popup offers constructors (`Just`, `Nothing`) and `Type(..)`

## What to build

Owner (2026-11-11): what matters is that the import is autocompleted when the player types `Just` or `Nothing`. Today the name table has types and functions but no constructors: typing `Maybe` offers `import Data.Maybe (Maybe)`, which lets a Solution write the type but not the values `Just` and `Nothing`, and typing `Just` offers nothing. The player then has to write `import Data.Maybe (Maybe(..))` by hand.

Make the popup offer the right import for a constructor: typing `Just` or `Nothing` (after 2 letters, as for any name) offers `Just` with its module `Data.Maybe`, and accepting it adds `Maybe(..)` to the import (all of the type's constructors), not `Just` alone. The same for every library type that has constructors in the pinned list (`Either`'s `Left`/`Right`, `Tuple`, and so on): derive them from the pinned libraries' exports, not from a hand-written list.

## Rules (extending the spec's "Import rules and the import popup")

- Accepting a constructor adds `Type(..)` to the library's import line, merged as today (`import Data.Maybe (fromMaybe)` becomes `import Data.Maybe (fromMaybe, Maybe(..))`; none: a new `import Data.Maybe (Maybe(..))` line, placed as today).
- If the type is already imported without constructors (`import Data.Maybe (Maybe)`), accepting a constructor turns `Maybe` into `Maybe(..)`, it does not add a second entry. If `Maybe(..)` is already imported, `Just` and `Nothing` are not offered (as for any imported name). Typing `Maybe` itself offers `Maybe(..)` when the type has constructors (so the player gets the constructors too), `Maybe` alone only for types without constructors.
- The import line stays one line (`import M (a, b)`): `Type(..)` fits the "one-line imports only" bank rule; puzzle-check's one-line import lint and its imported-names check must accept `Type(..)` and must check that the type exists and has that constructor set in the library sources.
- The inserted import is still inserted text, not typed (not a key press, not in WPM, excluded from limits), as in ticket 32.
- Name clashes and the preference list (`name-clashes.json`) work for constructors too (two modules exporting the same constructor name).
- The name table stays generated at build time from the pinned libraries' exports (`tools/puzzle-check/purs-exports.js`, `tools/purs-bundle/build.mjs`); the change is in the generator and the PureScript Language's import rules, nothing outside the PureScript modules names PureScript (L5).

## Acceptance

- [x] Typing `Just` and `Nothing` offers `Data.Maybe`, and Tab or Enter adds `Maybe(..)`; shown by a unit test of the import edit and by a real-browser driver check (Chrome; Firefox like ticket 32's driver).
- [x] Merge cases covered by tests: no existing import, existing import of the module, `Maybe` already imported bare, `Maybe(..)` already imported (nothing offered), a constructor with a clash.
- [x] The bundle's name table is rebuilt from the pinned libraries; its size change is recorded; the bundle verify script and tests still pass.
- [x] puzzle-check's import checks accept `Maybe(..)` in a Reference Solution and reject a constructor set that does not exist; tests cover both.
- [x] All gates pass; the spec's import section describes the rules.

## Comments

Built 2026-11-11 on branch `import-constructors`. Mechanism, by criterion:

- **Just/Nothing offer `Data.Maybe`, Tab or Enter adds `Maybe(..)`.** Generator: `tools/puzzle-check/purs-exports.js` (`constructorsDeclared`, `exportsOf` giving every type its `constructors`, `nameRows` giving the table rows: kind `data` for a type with all its constructors, `[name, "constructor", type]` for each constructor), written by `tools/purs-bundle/build.mjs`. Rules: `static/editor/src/languages/purescript.mjs` (`indexNames`, `offers`, `importEdit`). Tests: the `constructors:` tests in `static/editor/test/purescript.test.mjs`; real browsers: `static/editor/browser/drive-imports.mjs` new section "constructors (ticket 39)" (Chrome 157 and Firefox 158.0.1, 48 of 48 each; screenshots looked at: the popup shows `Just  Data.Maybe` / `Nothing  Data.Maybe`).
- **Merge cases.** Tests "typing Just or Nothing offers Data.Maybe..." (no import), "an existing import of the module is merged into", "the type imported bare becomes Type(..)" (also `Maybe(Just)`, a bare `Maybe` on a second import line, spaces), "with Maybe(..) imported, Just and Nothing are not offered", "a constructor two modules export follows the preference list" (`Pattern`: Data.String first, Data.List second; accepting either), plus Either, Tuple (a type and its constructor of one name is one offer) and `Void` (no constructors: stays bare).
- **Name table.** Rebuilt by `nix build .#purs-bundle`: 61,517 bytes (2,582 rows) before, 65,364 bytes (2,687 rows: 105 constructor rows, 86 `data` kinds) after, +3,847 bytes (+6.3%), 9,051 bytes gzipped. `tools/purs-bundle/test/build.test.mjs` "the names file lists constructors with their type", `verify.mjs --serve`: 44 files verified. Clash list: `Nil`, `Cons`, `NonEmptyList` added (Data.List first); `Pattern` was there.
- **puzzle-check.** `importNameProblems` now checks `T(..)` (the type must have constructors there) and `T(A, B)` (each must be exported). Tests in `tools/puzzle-check/test/languages.test.js`: on a small library tree (`Secret` abstract, a synonym, `Tag(Red, Blue)` against the undeclared-export `Green`, a re-export, a kind signature before the declaration) and on the real pinned libraries (`Maybe(..)` passes; `Maybe(Foo)`, `Void(..)`, `Foldable(..)`, `Nope(..)` fail). All 50 Reference Solutions still pass (15 use `Maybe(..)`, `Pattern(..)`, `Tuple(..)` or `Proxy(..)`; the first run failed `Proxy(..)` until the kind signature case was handled, found by the browser-checker test).
- **Counting.** Unchanged: the edit is one transaction tagged `input.complete` (a unit test says it is one change that keeps the cursor).
- **Broken on purpose and seen to fail** (`git diff` showed each break first): constructor imports its own name instead of `Type(..)` (6 tests fail), bare `Maybe` not replaced (1), constructors of an imported `Type(..)` still offered (1), constructor rows ignored (6); in puzzle-check: `T(..)` without constructors accepted (2), a missing constructor accepted (2), the generator reading no constructors (7).

Gates: `npm test --prefix static/editor` 159/159; `npm test --prefix tools/puzzle-check` 83/83; `npm test --prefix tools/purs-bundle` 39/39 (PURS_WASM, PURS_LIBS set); `npm ci` then `npm run check --prefix tools/puzzle-check`: all 50 Puzzle files pass; `npm run solutions -- --lang=purescript` 50 of 50; `nix build` and `nix build .#purs-bundle` pass; no Haskell touched (so no `common-test`, forced warning-clean or `strict` build); drivers on fresh exports: drive-language 28/28, drive-saved-data 20/20, drive-imports 48/48 Chrome and 48/48 Firefox, drive-purescript 53/53, smoke-purescript 7/7, drive-site passes, `verify.mjs --serve` verified.

Questions for the owner (not decided here):

- **Label.** A constructor shows as `Just` with `Data.Maybe` on the right, as any name; the popup does not say that accepting adds `Maybe(..)`. Should it show `Just  Data.Maybe (Maybe(..))` or the like?
- **Order.** Entries stay alphabetical ignoring case. After only `Not` the six places go to `Not` (two type-level classes from `Type.Data.Boolean` and `Type.Prelude`), `note` and `notElem`, so `Nothing` appears from `Noth`; after `Jus` `Just` is alone. Should a name matching the typed case (a capital) come first, or the `Type.*` modules be left out?
- **Bare `Maybe` and the type name.** With `import Data.Maybe (Maybe)` present, typing `May` offers nothing (the type is imported); only `Just` and `Nothing` widen it. Say if typing `Maybe` should offer the upgrade too.
