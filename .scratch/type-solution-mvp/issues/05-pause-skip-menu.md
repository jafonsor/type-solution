Status: ready-for-agent

# 05: Pause, skip and the menu

## What to build

The page opens on a random Puzzle. Esc before the first keystroke skips it; Esc during a Run pauses it; Esc again carries on. After a pass, a Pause or a skip, a menu of two icon buttons, New random Puzzle and Repeat Puzzle, opens below the status line. While it's open the editor is read-only and Tab moves between the buttons. Either button starts a new Run with an empty editor. Paused time doesn't count toward the Run's time or Words per minute.

## Acceptance criteria

- [ ] On load, the Puzzle is picked at random from the whole bank.
- [ ] Esc before the first keystroke: status line "Skipped.", menu opens.
- [ ] Esc during a Run (typing or checking): the clock stops, the editor goes read-only, status line "Paused. Esc to carry on.", menu opens.
- [ ] Esc while paused: menu closes, editor is editable and focused, clock carries on.
- [ ] Esc with the menu open after a pass or a skip does nothing.
- [ ] A Run's time and Words per minute leave out all paused time.
- [ ] A check running when Esc is pressed still counts: if it passes, the Run ends as passed at the time the Pause began; if it fails, its feedback shows.
- [ ] Choosing a button while paused drops the Run with no record saved.
- [ ] After a pass the editor no longer accepts typing (today it does).
- [ ] The menu: New random Puzzle ("skip next" icon) then Repeat Puzzle (circular "repeat" icon), each with a tooltip, drawn as inline SVG. It sits below the status line, above the feedback. When it opens, the first button takes focus. Tab / Shift+Tab move between the buttons; Enter or Space presses one.
- [ ] New random Puzzle picks at random from the whole bank; Repeat Puzzle keeps the Puzzle. Both start a Run with an empty, focused editor.
- [ ] The pass status line no longer says "Press Esc for another Run".
- [ ] The Run state machine's tests cover each Esc case, paused time being left out, a check passing during a Pause, and no record from a dropped Pause.

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
