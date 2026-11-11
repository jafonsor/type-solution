Type: task
Status: ready-for-agent

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

- Typing `Just` and `Nothing` offers `Data.Maybe`, and Tab or Enter adds `Maybe(..)`; shown by a unit test of the import edit and by a real-browser driver check (Chrome; Firefox like ticket 32's driver).
- Merge cases covered by tests: no existing import, existing import of the module, `Maybe` already imported bare, `Maybe(..)` already imported (nothing offered), a constructor with a clash.
- The bundle's name table is rebuilt from the pinned libraries; its size change is recorded; the bundle verify script and tests still pass.
- puzzle-check's import checks accept `Maybe(..)` in a Reference Solution and reject a constructor set that does not exist; tests cover both.
- All gates pass; the spec's import section describes the rules.
