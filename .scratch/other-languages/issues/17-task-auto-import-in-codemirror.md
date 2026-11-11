Type: task
Status: resolved
Blocked by: none

# 17: Does a CodeMirror completion edit the name and the top import block in one transaction?

## Question

[Ticket 08](08-prototype-auto-import.md) chose the auto-import behaviour on a textarea. Check, in real CodeMirror 6, that a completion's `apply` function can add or merge the import line at the top while leaving the typed name for the player, as one undoable transaction, and that Tab still indents with no popup. Record what works and any limit.

## Answer

**Plain version: it works.** In real CodeMirror 6 in Chrome, accepting a suggestion can add or merge the import line at the top while leaving the word you typed alone, as one undo step, and Tab still indents when no popup is open. Two settings need care, listed below.

**What was checked** (a small throwaway editor driven by real key presses in headless Chrome; `@codemirror/autocomplete` 6.20.4, `@codemirror/view` 6.43.14, `@codemirror/commands` 6.11.1; files in `.scratch/other-languages/prototype-auto-import-codemirror/`, `main.js` is the editor, `run.mjs` the scenario):
- **One transaction.** A completion's `apply` can be a function `(view, completion, from, to)` that dispatches its own change. Dispatching only the import edit (nothing at `from..to`) leaves the typed letters untouched. The cursor is mapped through the edit automatically (it moved from 6 to 32 when a two-line import went in above it), so no manual cursor code.
- **New and merged imports.** No imports gives `import Data.Array (take)` plus a blank line at position 0; an existing `import Data.Array (take)` becomes `import Data.Array (take, drop)` by inserting `, drop` before the `)`.
- **Undo.** One undo reverts only the import edit and leaves the typed text, as its own step. The typed letters are separate undo steps.
- **Tab.** A Tab binding at the highest precedence that runs `acceptCompletion` and falls through (it returns `false`) when no popup is open lets `indentWithTab` handle Tab. Confirmed: accepts with the popup, indents without. Enter accepts through the default completion keymap while the popup is open.
- **Counting.** The accept transaction can carry `userEvent: "input.complete"`, so the key-press recorder can tell inserted text from typed text. Not tested against the app's recorder.

**Limits found, with fixes.**
1. **Tab can arrive too early and indent instead.** By default the popup waits 100 ms after typing and ignores accepts for 75 ms after it shows. Tab pressed within about 150 to 200 ms of the last letter indented the line (6 of 7 timings failed up to 120 ms). Setting `activateOnTypingDelay: 0` and `interactionDelay: 0` made every timing from 0 to 400 ms accept. The build must set both.
2. **Do not use `validFor`.** It reuses an old option list, so a name already imported kept showing in the popup. Without it the completion source re-runs on each keystroke and the "already imported is not offered" rule holds.
3. **Close the popup after accepting.** Call `closeCompletion(view)` at the end of `apply`; otherwise the old popup stays up until the next key and a stale entry is visible. With it, the popup is gone after Tab and a second Tab indents.

**Not tested.** Other browsers (Safari, Firefox); the app's key-press recording and its "inserted, not typed" accounting; multi-name or multi-line imports (the merge here handles one-line `import M (a, b)` only; the real build needs a rule for `hiding`, qualified and wrapped imports, or must keep Reference Solutions to one-line imports); touch keyboards.
