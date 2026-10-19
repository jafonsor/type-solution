Status: ready-for-agent

# 05: Pause, skip and the menu

## What to build

The page opens on a random Puzzle. Esc before the first keystroke skips it; Esc during a Run pauses it; Esc again carries on. After a pass, a Pause or a skip, a menu of two icon buttons, New random Puzzle and Repeat Puzzle, opens below the status line. While it's open the editor is read-only and Tab moves between the buttons. Either button starts a new Run with an empty editor. Paused time doesn't count toward the Run's time or Words per minute.

## Acceptance criteria

- [x] On load, the Puzzle is picked at random from the whole bank.
- [x] Esc before the first keystroke: status line "Skipped.", menu opens.
- [x] Esc during a Run (typing or checking): the clock stops, the editor goes read-only, status line "Paused. Esc to carry on.", menu opens.
- [x] Esc while paused: menu closes, editor is editable and focused, clock carries on.
- [x] Esc with the menu open after a pass or a skip does nothing.
- [x] A Run's time and Words per minute leave out all paused time.
- [x] A check running when Esc is pressed still counts: if it passes, the Run ends as passed at the time the Pause began; if it fails, its feedback shows.
- [x] Choosing a button while paused drops the Run with no record saved.
- [x] After a pass the editor no longer accepts typing (today it does).
- [x] The menu: New random Puzzle ("skip next" icon) then Repeat Puzzle (circular "repeat" icon), each with a tooltip, drawn as inline SVG. It sits below the status line, above the feedback. When it opens, the first button takes focus. Tab / Shift+Tab move between the buttons; Enter or Space presses one.
- [x] New random Puzzle picks at random from the whole bank; Repeat Puzzle keeps the Puzzle. Both start a Run with an empty, focused editor.
- [x] The pass status line no longer says "Press Esc for another Run".
- [x] The Run state machine's tests cover each Esc case, paused time being left out, a check passing during a Pause, and no record from a dropped Pause.

## Blocked by

- 01: Puzzles come from TOML files at build time

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` ("The Run", "The page"); behaviour decided in `.scratch/type-solution/issues/11-grilling-bests-results-sharing.md`.
- **Keep the Run logic in the pure state machine** in common code (`step` over events), so it's tested there. Add phases for Paused and Skipped and a "start new Run on this Puzzle" event. The menu is open exactly when the phase is Paused, Skipped or Passed: the Run decides it, not the page.
- **Trap:** today Esc is the `Restarted` event, which starts the Run over, and the status line tells the player to press Esc after a pass. Both go: Esc now means skip / pause / resume, and the buttons are the only way to give up a Run.
- **Trap:** the editor's keymap includes `indentWithTab`, so Tab indents. While the menu is open the editor must not capture Tab, or focus can't move to the buttons. The editor shim needs a way to set read-only and back; Esc is caught in the shim's `keydown` handler and must still reach Haskell while read-only.
- Today `step` ignores everything once Passed; keep that, and also ignore edits while Paused or Skipped. Edits made while read-only shouldn't happen anyway.
- Passing during a Pause ends at the Pause's start, so the Run's time never includes paused time.
- No icon library. The browser's default button behaviour handles Enter and Space.
- Personal bests on the status line are ticket 07; leave the pass line as "Passed in 12.3 s, 42 wpm, 3 backspaces." here.
- Ticket 06 also changes the Run state machine and may run at the same time; expect a small merge.
- Domain words: Run, Pause (not "break"), Puzzle, Words per minute.

## Comments

Decisions the ticket left open, made while building it:

- **Where things live.** The Run state machine (`Common.Run`) gained the phases `Paused` and `Skipped`, the events `Escaped UTCTime` (Esc, with its time, so paused time comes from event times, never the clock) and `NewRunStarted` (either menu button; it replaces `Restarted`), `menuOpen`, and `recordOnStep` (the record a step leaves: only a step that passes the Run leaves one; the page saves exactly what it returns, so a Run dropped from a Pause can't be recorded). The status line moved to a new pure module, `Common.Status` (`statusText`, `secondsText`), so ticket 07 can give it the stored history without `Common.Run` depending on the history module. `NewRunStarted` carries no Puzzle: the page keeps the chosen Puzzle beside the Run, as before.
- **A Pause remembers where it was.** Esc again goes back to the phase it paused (typing, checking, or a failed check with its feedback). A check that finishes during the Pause updates that: a failure keeps its feedback (shown while paused) and the Run carries on as a failed check; a pass ends the Run at the Pause's start.
- **Checks around a Pause.** A check that was waiting on the 400 ms quiet time when Esc was pressed still starts, and counts like one already running. A check that would start on a Run not started (left over from a Run just dropped by a button) is ignored by the Run and never sent to a worker.
- **Random choice.** `Common.Bank.randomPuzzle` maps a number in [0, 1) to a Puzzle, each equally likely; the number is `Math.random()` through the editor shim (`TypeSolution.random`). New random Puzzle may give the same Puzzle again.
- **Esc reaches Haskell from anywhere on the page.** The shim listens for Esc on the whole document (capture phase), not only in the editor, as the focus is on a menu button while it's open. The editor's own Esc handling (CodeMirror's "simplify selection") is switched off.
- **Read-only** is `EditorState.readOnly` plus `EditorView.editable(false)` in a compartment, which also holds `indentWithTab`, so Tab is the browser's while the menu is open.
- **Focus.** The menu opening focuses New random Puzzle; it closing (Esc from a Pause, or a button) focuses the editor. The editor is also focused once the app has started (it wasn't before, as it was built before being on the page). One consequence to know: a pass opens the menu with the focus on New random Puzzle, so a Space or Enter typed after the pass (the check runs 400 ms after the last key) presses it.
- **Icons** are drawn here (no copied icon set): a play triangle against a bar for "skip next", an open circle with an arrowhead for "repeat".

Closed on branch `type-solution-mvp` by the commit "Ticket 05: Pause, skip and the menu". Status is left for the maintainer.

Review evidence:

- `cabal test common` passes 60/60, and the forced `-Werror` build and `nix build` pass.
- Two deliberate breaks each turned the suite red, and it went green again once restored:
  - Ending a pass during a Pause at the check's time, instead of at the Pause's start, fails 3 tests.
  - Counting paused time fails 3 tests, among them "paused time is left out of the Run's time and words per minute".
- Smoke test on the **production** build (`result/backend`), headless Chrome:
  - Skip, and Esc after a skip doing nothing.
  - Pause: the clock stays at 1.1 s across 1.5 s, and typing is ignored.
  - Tab and Shift+Tab move between the buttons; Esc resumes the Run.
  - Repeat while paused: the record count stays at 0.
  - A pass saves one record, the editor then takes no input, and Esc does nothing.
  - Repeat gives the same Puzzle and New random gives a new one. The console shows no errors.
- Open product question, raised by the implementer: a pass moves the focus to New random Puzzle. A Space or Enter typed just after the pass therefore starts a new Run. The spec asks for this focus, so it was left as it is.
