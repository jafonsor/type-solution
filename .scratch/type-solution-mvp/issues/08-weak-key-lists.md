Status: ready-for-agent

# 08: Most missed and Slowest lists

## What to build

Two lines below the editor, always visible and refreshed after each passed Run: "Most missed: …" (the five characters with the most Corrections) and "Slowest: …" (the five with the highest median Hesitation), over the player's last 20 passed Runs.

## Acceptance criteria

- [ ] Both lines sit at the bottom of the page, below the menu and the feedback, and never move.
- [ ] The history module works out both lists from the saved records, using the last 20 passed records that still have key presses.
- [ ] Correction: a character typed straight after a run of exactly one or two Backspaces counts as a miss of that character. Three or more Backspaces in a row count for nothing.
- [ ] Hesitation: time since the previous press; each Run's first press and any gap over 1.5 s are left out. A character's score is its median.
- [ ] Only characters typed at least 10 times in those Runs appear. Space, Enter and Tab never appear. `A` and `a` stay apart.
- [ ] Each list shows at most five characters, and nothing until some character reaches the minimum.
- [ ] Both lists refresh right after a pass.
- [ ] Tests for the history module cover each rule above, including records without key presses being skipped.

## Blocked by

- 06: Record key presses with their timings
- 07: Personal bests on the status line

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` ("History and stats"); decided in `.scratch/type-solution/issues/10-grilling-per-key-mistakes.md`.
- The definitions of Correction and Hesitation are in `CONTEXT.md`; use those words exactly (not "error", "typo", "latency" or "delay").
- Rejected: a keyboard heatmap, because the player's layout is unknown. Also rejected: weighting the next Puzzle toward weak keys (out of scope for the MVP).
- Only passed Runs are saved, so a Run given up from a Pause never feeds the lists.
- Show the characters themselves; pick a readable way to show symbols such as `'` and `` ` ``.
