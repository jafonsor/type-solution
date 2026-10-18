Status: ready-for-agent

# 07: Personal bests on the status line

## What to build

After a pass, the status line compares the Run with the player's Personal best on that Puzzle:

- first pass: "Passed in 12.3 s, 42 wpm, 3 backspaces. First time on this Puzzle."
- new best: "Passed in 12.3 s, 42 wpm, 3 backspaces. New best (was 14.0 s)."
- otherwise: "Passed in 15.1 s, 38 wpm, 5 backspaces. Best: 12.3 s."

Bests are worked out from the Runs saved in this browser.

## Acceptance criteria

- [ ] The editor shim can read all saved records; Haskell decodes them, old formats included.
- [ ] A new pure history module in common code takes the saved records and gives a Puzzle's Personal best: its fastest passed record.
- [ ] The pass status line ends with one of the three endings above, comparing against the records saved before this Run.
- [ ] The best is never shown during a Run.
- [ ] Bests are never stored separately; nothing is sent over the network.
- [ ] Tests for the history module cover: fastest per Puzzle, other Puzzles ignored, and each of the three endings.

## Blocked by

- 05: Pause, skip and the menu

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` ("History and stats"); decided in `.scratch/type-solution/issues/11-grilling-bests-results-sharing.md`.
- **Best means one thing:** the fastest time on the Puzzle. That Run's words per minute and backspaces go with it. No separate best per number, no overall best.
- Rejected: storing bests separately. They're worked out from the records every time, so they can't drift.
- A best belongs to the Puzzle's identity (file name). Editing a Puzzle file keeps its old bests.
- Write the status text as a pure function of the Run and the history, so it's tested in the common suite. Ticket 05 rewrote the status line first, which is why this waits for it.
- Keep the history module's interface ready for ticket 08 (Most missed / Slowest) to add to it.
- Domain words: Personal best (not "high score", "record" or "PB"), Run, Puzzle.
