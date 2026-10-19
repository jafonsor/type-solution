Status: ready-for-agent

# 08: Most missed and Slowest lists

## What to build

Two lines below the editor, always visible and refreshed after each passed Run: "Most missed: …" (the five characters with the most Corrections) and "Slowest: …" (the five with the highest median Hesitation), over the player's last 20 passed Runs.

## Acceptance criteria

- [x] Both lines sit at the bottom of the page, below the menu and the feedback, and never move.
- [x] The history module works out both lists from the saved records, using the last 20 passed records that still have key presses.
- [x] Correction: a character typed straight after a run of exactly one or two Backspaces counts as a miss of that character. Three or more Backspaces in a row count for nothing.
- [x] Hesitation: time since the previous press; each Run's first press and any gap over 1.5 s are left out. A character's score is its median.
- [x] Only characters typed at least 10 times in those Runs appear. Space, Enter and Tab never appear. `A` and `a` stay apart.
- [x] Each list shows at most five characters, and nothing until some character reaches the minimum.
- [x] Both lists refresh right after a pass.
- [x] Tests for the history module cover each rule above, including records without key presses being skipped.

## Blocked by

- 06: Record key presses with their timings
- 07: Personal bests on the status line

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` ("History and stats"); decided in `.scratch/type-solution/issues/10-grilling-per-key-mistakes.md`.
- The definitions of Correction and Hesitation are in `CONTEXT.md`; use those words exactly (not "error", "typo", "latency" or "delay").
- Rejected: a keyboard heatmap, because the player's layout is unknown. Also rejected: weighting the next Puzzle toward weak keys (out of scope for the MVP).
- Only passed Runs are saved, so a Run given up from a Pause never feeds the lists.
- Show the characters themselves; pick a readable way to show symbols such as `'` and `` ` ``.

## Comments

Decisions the ticket left open, made while building it:

- **The module.** `Common.History` gains `mostMissed :: History -> [(Char, Int)]` (each character with its count of Corrections) and `slowest :: History -> [(Char, Double)]` (each with its median Hesitation in milliseconds). Both are worked out from the records each time. They look at the last 20 records that still have key presses. Records without presses (stored before ticket 06, or stripped when storage filled) are skipped first, so they don't use up one of the 20. `containers` is added to `common` for `Data.Map`.
- **Correction.** Backspaces in a row are counted. The next press that isn't a Backspace ends the run. If the run was one or two Backspaces and that press is a character, it's a Correction of that character. Then counting starts again from zero. If the press is Space, Enter or Tab, it counts for nothing, as those never appear.
- **Typed.** A character is typed once for each press of it in those Runs, Corrections and each Run's first press included. The 10-press minimum is counted over all those Runs together, not per Run.
- **Most missed needs a miss.** A character with no Corrections isn't listed, even when typed 10 times or more. Listing a character as "missed" with zero misses would mislead. So the list stays empty until some character has both 10 presses and at least one Correction.
- **Hesitation after a Backspace counts.** A character typed straight after a Backspace still adds its gap to its Hesitation. CONTEXT.md defines Hesitation as the time before any key press, and finding the right key after a miss is exactly the searching Hesitation should show. Correction already counts the miss itself, so the two lists measure different things. The Backspace's own gap counts toward nothing: it isn't a character.
- **Gaps.** "Over 1.5 s" is strict: a gap of exactly 1500 ms counts. Each Run's first press is left out, whatever its gap. A character typed 10 times whose gaps are all over 1.5 s has no Hesitation to score, so it isn't in Slowest.
- **Median.** For an even number of gaps, it's the mean of the two middle ones (so it can end in .5 ms).
- **Order and ties.** Worst first: most Corrections, or highest median. Ties go by character, lowest code point first (so `,` comes before `.`, and `A` before `a`). At most five are shown.
- **Empty lists.** The line shows a muted dash `—` after its label, with the tooltip "Not enough typed yet".
- **Showing symbols.** Each character sits in its own `<kbd>` chip: monospace, bold, with a border and padding, so a lone `,`, `.`, `'`, `` ` `` or `"` is easy to see. The spec asks only for the characters, so no numbers are shown on the line. Each chip's tooltip gives its score: "3 Corrections" (or "1 Correction"), or "Median Hesitation 312 ms".
- **Layout: never moving.** The two lines are a `<footer class="weak-keys">` after the feedback, fixed to the bottom of the window and lined up with the page's column. Both the feedback (one line per failed test) and the menu (shown or hidden) change height. So any place in the page's flow below them would move, and the fixed footer is the one that doesn't. `main.run` gains bottom padding so the end of a long feedback list can scroll clear of it. Each line has a fixed height, so filling it moves nothing.
- **Refresh.** The lists are `mostMissed`/`slowest` of the page's `dHistory`, which gains a passed Run's record in the frame it passes. This is ticket 07's policy: storage is read once, at load. So a Run that storage couldn't keep still counts until the page reloads.

Closed on branch `type-solution-mvp` by the commit "Ticket 08: Most missed and Slowest lists". Status is left for the maintainer.

Review evidence:

- `cabal test common` passes 91/91, and the forced `-Werror` build and `nix build` pass (exit 0).
- Counting a Correction after any number of Backspaces fails "a character typed straight after one or two Backspaces is a Correction; after three or more it isn't". The suite passes again once restored.
- Smoke test on the production build (`weak.mjs`):
  - Fresh storage shows "—" in both lines.
  - Seeded records name `;` as Most missed, and `{ , ; " '` as Slowest.
  - A pass refreshes the lines without a reload.
  - The footer stays at the same position in every state, and the layout order is right.
- For the maintainer to judge: the lines are a footer fixed to the bottom of the window, which can sit far below the editor on a tall screen. A character with no Corrections is never "Most missed". Hovering a chip shows its count or its median Hesitation.
