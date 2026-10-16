# Grilling: personal bests, the results screen and sharing

Type: grilling
Status: resolved
Blocked by: 10

## Question

Left open by "Grilling: what a Run records and shows". What is a personal best when a Run has time, words per minute and backspaces (one of them, each separately, per Puzzle or overall)? What does the player see after a pass, given Runs auto-advance (the status line alone, or a results screen, and for how long)? Is share-as-text in the MVP, and if so what does it say?

## Answer

**Personal best:** the fastest time on each Puzzle; that Run's words per minute and backspaces are shown with it. No separate best per number, no overall best. Bests are worked out from the Runs already in browser storage (every Run's summary is kept), never stored separately; nothing leaves the browser. A best belongs to the Puzzle's file name: if a Puzzle file is edited, its old bests stay.

**After a pass:** the Run ends by itself (no submit key) and the player stays on it; nothing loads by itself. The status line reads:

- first pass on a Puzzle: "Passed in 12.3 s, 42 wpm, 3 backspaces. First time on this Puzzle."
- new best: "Passed in 12.3 s, 42 wpm, 3 backspaces. New best (was 14.0 s)."
- otherwise: "Passed in 15.1 s, 38 wpm, 5 backspaces. Best: 12.3 s."

The best is never shown during a Run.

**The menu:** two icon buttons below the status line, above the Most missed / Slowest lists: **New random Puzzle** (a "skip next" icon) then **Repeat Puzzle** (a circular "repeat" icon), each with a tooltip, drawn inline (no icon library). The menu is open after a pass, while paused, and after Esc before the first keystroke. When it's open the editor is read-only and Tab no longer indents, so Tab / Shift+Tab move focus between the buttons and Enter or Space presses one (browser default). Both buttons start a Run with an empty editor.

**Esc:**

- before the first keystroke: opens the menu ("Skipped."), so the player can skip a Puzzle without typing.
- during a Run: **pauses** it. The clock stops, the editor freezes, status line "Paused. Esc to carry on.", and the menu opens. Esc again closes the menu, focuses the editor and carries on.
- with the menu open and no Run in progress (after a pass or a skip): does nothing.

Paused time doesn't count toward the Run's time or words per minute. Choosing a button during a Pause drops the Run unrecorded; the buttons are now the only way to give up. A check still running when Esc is pressed counts: if it passes, the Run ends as passed at the paused time.

**Sharing:** share-as-text is out of scope for the MVP (anonymous, solo practice; a shared time compares to nothing).

**Known gap in the code today:** after a pass the editor still accepts typing (the Run ignores it), and Tab is bound to indent; the read-only menu state fixes both.
