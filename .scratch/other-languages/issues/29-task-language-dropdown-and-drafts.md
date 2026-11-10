Type: task
Status: resolved
Blocked by: 26

# 29: Language dropdown bar, Alt+L, per-Language drafts

## What to build

Build order step 4, first part. Prototype: `.scratch/other-languages/prototype-language-dropdown/`.

## Acceptance

- [x] Picking a Language swaps the editor's Language and shows that Language's signature; each Language keeps its own draft per Puzzle.

## Comments

Built (build order step 4, first part). Mechanism:

- `static/editor/src/language-choice.mjs` (pure, tested): the remembered Language (`localStorage["type-solution.language"]`, read once, unknown or unreadable is JavaScript), Alt+L order (`nextLanguage`), the draft store (`createDrafts`, memory only, an untouched Language has none and opens empty) and `createLanguageChoice` tying them together. It takes the Language names from the registry, so the dropdown, drafts and the saved key stay data-driven (L5).
- `static/editor/src/editor.js`: each Language's draft is a whole CodeMirror state (text, cursor, undo history), swapped with `view.setState`; Alt+L (physical `L` key with Alt) calls the page's `onCycle` and is not a key press a Run counts; `setLanguage`, `nextLanguage`, `reset` (a new Run drops every draft, keeps the Language), `initialLanguage`, `languages`, `registerLanguage`. The picks feed ticket 28's `createBundleTrigger` (`onPick`, and `onPageLoad` for the remembered Language); a Language's value may carry `bundle: {start}`.
- `frontend/src/Frontend/Run.hs`: the thin `.editor-bar` under the editor with `Alt+L` and the `<select>` at its right edge, built from the shim's Language list; the signature above the editor comes from the Puzzle's per-Language table (`Common.Puzzle.languageTable`); one Checker per Language, made when first used. `Common.Run` has a `CodeSwapped` event: it never starts the clock and never resets it (L3).
- `static/default.nix`: the editor derivation's source now also holds `static/bundle/` (the shim imports `trigger.mjs`). `static/editor` changed, so the default derivation changed; expected.

Tests: `static/editor/test/language-choice.test.mjs` (remembered value, Alt+L order and wrap, a third Language, drafts survive a switch back, untouched opens empty, a new Run drops drafts, a second registered Language with its own mode, picks and the bundle trigger); `common/test/Main.hs` (`CodeSwapped` does not start or reset the clock, drops the last outcome and the check in flight; `languageTable`).

Manual verification, real Chrome (`static/editor/browser/drive-language.mjs`, 28 of 28 checks), on the exported `nix build` output, with a stub second Language registered under the name `purescript` (the app has only JavaScript so far; its Puzzle table is the real PureScript one): first visit opens in JavaScript; the dropdown lists the registry; the bar is directly under the editor with the select at its right edge; picking the stub swaps the signature to the PureScript two-liner and opens an empty editor; the clock kept running (1.2 s then 1.3 s then 1.9 s, no reset); the bundle started once, on the first pick; Alt+L cycled both ways and each draft came back; Alt+L typed nothing; undo never reached into the other Language's text; after a reload the page opens in the remembered Language, empty editor, clock at 0, and the bundle starts at load; the JavaScript draft did not survive the reload; with the menu open the dropdown is disabled; a new Run keeps the Language and drops every draft; an unknown saved value opens in JavaScript. Screenshot looked right (bar under the editor, `Alt+L` hint and `PureScript (stub)` at the right).

Not done here, by design: the `language` field on Runs and per-Language bests and weak keys (ticket 30), the PureScript checker, loading line and errors (31), editor mode and imports (32), the browser smoke test (33). **The `?` Reference Solution tooltip does not exist yet** in the app (nothing in `frontend/` or the shim shows a Reference Solution), and the plan has no ticket that builds it (ticket 30 only has the `peeked` flag). It was not built here.

Questions for the owner (the plan is silent; chosen so the feature works, to be confirmed):
1. The `?` tooltip and the 1 s peek mark have no ticket that builds the tooltip itself. Which ticket owns it?
2. While the menu is open (Paused, after a pass or a skip) the editor is read-only; the dropdown is disabled and Alt+L does nothing then. Should a Language be pickable while Paused?
3. Switching away stops the check in flight for the Language left (the Run's `code` is the shown draft). So a draft that would have passed in the 400 ms before the switch is checked again only when the player switches back. L3 says whichever Solution passes first ends the Run; ticket 30 (the Run records the passing Language) may want to let the left Language's check finish. Confirm.
4. Switching to a Language whose draft is empty starts no check and clears the last failure shown; to one with text, a check runs 400 ms later.
5. Option+L on a Mac types a character; Alt+L is matched on the physical key, so it is taken from the player on layouts where Option+L types something (not a key press a Run counts).
