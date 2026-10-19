Status: ready-for-agent

# 07: Personal bests on the status line

## What to build

After a pass, the status line compares the Run with the player's Personal best on that Puzzle:

- first pass: "Passed in 12.3 s, 42 wpm, 3 backspaces. First time on this Puzzle."
- new best: "Passed in 12.3 s, 42 wpm, 3 backspaces. New best (was 14.0 s)."
- otherwise: "Passed in 15.1 s, 38 wpm, 5 backspaces. Best: 12.3 s."

Bests are worked out from the Runs saved in this browser.

## Acceptance criteria

- [x] The editor shim can read all saved records; Haskell decodes them, old formats included.
- [x] A new pure history module in common code takes the saved records and gives a Puzzle's Personal best: its fastest passed record.
- [x] The pass status line ends with one of the three endings above, comparing against the records saved before this Run.
- [x] The best is never shown during a Run.
- [x] Bests are never stored separately; nothing is sent over the network.
- [x] Tests for the history module cover: fastest per Puzzle, other Puzzles ignored, and each of the three endings.

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

## Comments

Decisions the ticket left open, made while building it:

- **Reading the records.** The shim gains `TypeSolution.loadRuns()`. It returns the text stored under `type-solution.runs`, or `"[]"` when nothing is stored or storage can't be read (it never throws). The logic is `loadRuns` in `static/editor/src/storage.mjs`, tested in `storage.test.mjs`. The shim doesn't check the text. Haskell reads it with `Common.History.decodeRecords`: each element of the list is read on its own with `RunRecord`'s `FromJSON` (so old ticket-01 records and records stripped of key presses read), and an element that doesn't read is skipped without losing the rest. Text that isn't a JSON list gives no records. The page only reads; it never rewrites what it couldn't read.
- **The module.** `Common.History` has an opaque `History`, built once with `history :: [RunRecord] -> History` (oldest first, as stored) and grown with `addRecord`. Questions about it are functions on it: `personalBest :: Text -> History -> Maybe RunRecord` (by Puzzle identity) and `standing :: Text -> Double -> History -> Standing`, where `Standing` is `FirstTime | NewBest Double | NotBest Double` (the old or current best's seconds). Ticket 08 can add Most missed and Slowest as more functions on `History`.
- **Personal best.** It's the fastest record on the Puzzle's identity; records of other Puzzles are ignored. Of two equally fast records, the earlier one is the best. Nothing is stored apart from the records.
- **Ties.** A Run exactly as fast as the best is not a new best: the line ends "Best: …". Only a strictly faster time gives "New best (was …)".
- **Rounding.** The comparison uses the seconds as the record stores them (`realToFrac (elapsed …)`, the same value `runRecord` writes). The text shows one decimal. So a Run of 12.26 s against a best of 12.34 s reads "Passed in 12.3 s, … New best (was 12.3 s)." That's accepted: it really was faster.
- **Status line.** `statusText :: Puzzle -> History -> Run -> Text`, still pure, tested in the common suite. Only the pass line looks at the history, so the best is never shown during a Run. The pass line without words per minute (a zero-length Run) gets the ending too.
- **Keeping the page's history up to date.** The page reads storage once, when it loads. After that it appends each record it saves to its own history in Haskell; it doesn't re-read storage. Re-reading would mean decoding up to ~5 MB on every pass. Appending also means a Run that storage couldn't keep (a private window, a full storage) still counts as the player's best for the rest of the visit. On the next visit it's gone, as it never was saved, and the comparison then reflects what this browser holds. Runs passed in another tab show up after a reload.
- **Comparing with the records before the Run.** The status line uses the history as it was when the Run began. That snapshot is taken when a menu button starts a new Run. The record saved by a pass reaches the history in the same frame as the pass, so the snapshot keeps a pass from comparing with its own record.
- **Network.** No fetch or XHR is added. Storage is reached only through the shim.

Closed on branch `type-solution-mvp` by the commit "Ticket 07: Personal bests on the status line". The implementer handed back before the last two gates, so the reviewer ran them and committed. Status is left for the maintainer.

Review evidence:

- `cabal test common` passes 78/78, `npm test --prefix static/editor` passes 8/8, the forced `-Werror` build passes (exit 0), and `nix build` passes.
- Making `personalBest` count other Puzzles' Runs fails 4 tests, among them "other Puzzles' Runs are ignored". The suite passes again once restored.
- Smoke test on the production build (`bests.mjs`):
  - First pass: "… First time on this Puzzle."
  - Repeat, slower: "… Best: 3.4 s."
  - Repeat, faster: "… New best (was 3.4 s)."
  - Repeat, slower again: "… Best: 1.8 s."
  - No status line during a Run mentions a best.
  - With 50 seeded old-format records plus junk, the page plays and gives "New best (was 99.9 s)."
  - With storage holding "not json", play goes on ("First time on this Puzzle.") and the Run isn't kept; the junk is left alone.
  - The page makes no requests anywhere but its own server.
