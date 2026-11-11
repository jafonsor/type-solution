Type: grilling
Status: resolved
Blocked by: none

# 04: A Puzzle file with several Languages

## Question

Today a Puzzle file (`puzzles/*.toml`) has `function`, `signature`, `prompt`, `reference` and `[[tests]]`. Decide how it holds a signature and a Reference Solution per Language while the tests stay shared: file layout, whether the prompt's example stays Language-neutral, which keys are per-Language, how the build's rules (`common/src/Common/Puzzle.hs`) and the puzzle-check tool change, and which of the 50 Puzzles cannot be expressed in PureScript (from ticket 02) and what happens to them under the "every Puzzle in every Language" rule.

## Answer

**Layout.** One file per Puzzle. `function`, `prompt` and `[[tests]]` stay at the top level and are shared by every Language. Each Language gets a table (`[javascript]`, `[purescript]`) holding `signature` and `reference`. A missing table means the Puzzle is not in that Language yet. Existing files migrate by wrapping `signature` and `reference` in `[javascript]`. `Puzzle.hs` accepts the known Language tables and rejects unknown names; puzzle-check runs each Language's Reference Solution in that Language's runner.

**Prompt.** One prompt, Language-neutral. Examples are written as plain input → output pairs (`"internationalization" → "i18n"`), and puzzle-check lints out Language-specific call syntax.

**Signature.** JavaScript keeps its one-line call shape (`chunk(items, size)`). PureScript's is two lines, a type line and a definition head with the parameter names, shown above the editor:

    chunk :: forall a. Array a -> Int -> Array (Array a)
    chunk items size = ...

The player types both lines. They are part of the Reference Solution and count toward its limits. Parameter names are shared with the order the tests pass.

**Limits (changed).** The Reference Solution limit is 4-30 non-blank lines and 100-900 characters, for every Language (was 4-12 and 100-350). Existing JavaScript Puzzles need no change. Import lines do not count.

**Imports.** They stay in the Solution so it reads as final code. They are inserted by an autocomplete popup (accept a name with Tab, the name and its import line are inserted), switched on per Language; JavaScript has no imports. Text inserted by accepting a completion is not typed text: not a key press in the Run record, not in words per minute. The player's own key presses still count. Prelude names need no import. The name-to-module table is static, and puzzle-check verifies every symbol in a Reference Solution is in it. The editor has no autocompletion today (`static/editor/src/editor.js`), so this is a new feature, to be prototyped.

**Awkward Puzzles (Research 02).**
- Polymorphic lists (`chunk`, `everyOther`, `positions`, `rotate`, `unique`, `grid`, `flatten`, `zip`): `forall a.` types; `flatten` is one level (`forall a. Array (Array a) -> Array a`); `unique` and `positions` need `Eq a =>`; `zip` returns `Array (Tuple a b)` and the harness converts it to JSON pairs.
- One-value-type objects (`countWords`, `groupByLength`, `invert`, `mergeCounts`, `toggleFlags`, `topScorer`, `totalCost`, `pick`): `Object a`.
- `queryString`: kept, tests untouched, as an advanced-types Puzzle (record of any shape, walked with `RowToList` and a type class). `withDefaults`: kept, tests untouched, as `Record.merge` with a `Union`/`Nub` type. The owner wants Puzzles that practise advanced types and typing together.
- `getPath`: kept, tests untouched, typed with `Json` (`Json -> String -> Json`); a deliberate interop Puzzle.
- So every Puzzle has a PureScript Solution and the "every Puzzle in every Language" rule holds with no exceptions.

**Unverified (no compiler was available).** The `queryString` and `withDefaults` sketches, the `Type.Proxy` module name, dictionary passing for `Eq a =>`, and the runtime shape of `Tuple`. They are checked when a Reference Solution is written (see the bank-authoring fog) and by Can purs be built for the browser?.

**Spawned.** [08 Auto-import in the editor](08-prototype-auto-import.md).

