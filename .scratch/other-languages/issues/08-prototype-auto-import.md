Type: prototype
Status: resolved
Blocked by: none

# 08: Auto-import in the editor

## Question

[Ticket 04](04-grilling-puzzle-file-per-language.md) decided that PureScript Solutions keep their import lines, inserted by an autocomplete popup (Tab accepts a name; the name and its import line are inserted), with import lines outside the length limits and inserted text not counted as typed. The editor has no autocompletion today and is deliberately plain (Tab indents, Enter starts a new line).

Prototype it with the player in the loop: when the popup appears (after how many letters, on which names), what accepting looks like when the import line already exists or must be merged (`import Data.Array (take)` then `drop`), where the cursor ends up, whether Tab indenting is still available, and how it looks next to the Language dropdown from [ticket 05](05-prototype-language-dropdown.md). Use a small static name-to-module table. Check the CodeMirror `@codemirror/autocomplete` API for a completion whose accept action also edits the top of the file.

## Answer

**Plain version: variant D.** While you type a name, a small list pops up under the caret showing matching names and, on the right, the module each one comes from. Tab (or Enter) adds the import line at the top of the code, but it does not finish the word: you still type the whole function name yourself. You first chose A (the popup also completes the name), then asked for this mix and chose D after trying it.

**Behaviour.**
- **When it appears:** after 2 letters, on names in a static name-to-module table, up to 6 matches. Never on an `import` line itself. It stays open while you keep typing, so a fully typed name can still be imported with Tab afterwards. Esc closes it; clicking elsewhere or leaving the editor closes it too.
- **Not offered:** names already imported and Prelude names (no import needed). So once the import exists, Tab goes back to indenting.
- **Accepting:** Tab or Enter adds only the import line for the highlighted name; the typed letters are left alone. Up and down arrows move the highlight. While the popup is open, Enter accepts instead of starting a new line (a second Enter then makes the newline). You did not rule on Enter after trying D, so it stays as prototyped; dropping it and keeping Tab only is a one-line change if it annoys in real use.
- **Imports:** if the module already has an `import M (...)` line, the name is merged into it (`import Data.Array (take)` then `drop` gives `import Data.Array (take, drop)`). Otherwise a new line goes after the last import, or at the very top followed by a blank line when there were no imports.
- **Cursor:** does not move relative to the text you typed, even though a line was added above it.
- **Tab indenting:** still works. With no popup open, Tab inserts two spaces; Tab only means "accept" while the popup is showing.
- **Counting:** everything the player types counts as typed, the name included. Only the import line is inserted by autocomplete; it is not counted as typed and is excluded from the line and character limits. This changes ticket 04's wording ("inserted text not counted as typed"): only the import line is inserted now.
- **Next to the Language dropdown:** no clash. The popup floats over the editor text; the dropdown bar sits below the editor.

**Not chosen:** A (the popup also completes the name), B (one grey suggestion after 1 letter) and C (no popup; the import is added when the word ends).

**Open for the real build.** The prototype is a plain textarea, so the CodeMirror question in this ticket (a completion whose accept action also edits the top of the file) was not tested. D makes it simpler: accepting only inserts at the top, the typed word is untouched. From memory, `@codemirror/autocomplete` lets a completion's `apply` be a function that receives the view and dispatches its own transaction; this was not re-checked in this session. The name-to-module table in the real app would be generated from the bank (see Bank authoring on the map).

## Comments

Prototype built (throwaway, not committed): `.scratch/other-languages/prototype-auto-import/index.html`. Open it in a browser; `?variant=A|B|C` or the bottom bar switches. A: list popup after 2 letters, Tab/Enter accepts. B: one grey suggestion after 1 letter, Tab accepts. C: no popup, the import is added when the word ends. All: merges into an existing `import Data.Array (take)` line, caret stays after the name, Tab with no popup indents, a counter shows typed vs inserted characters. Awaiting the player's verdict before resolving.

Claim released (2026-10-28): no session was working on this ticket. The prototype is finished and still waiting for the player's verdict on variants A, B and C; the next session to take it starts there, not from scratch.

Verdict (2026-10-29): first chose A, then asked for a mix where the player still types the name; variant D was added to the prototype and chosen. Ticket resolved.
