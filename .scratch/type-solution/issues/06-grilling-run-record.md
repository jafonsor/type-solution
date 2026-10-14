# Grilling: what a Run records and shows

Type: grilling
Status: resolved

## Question

What does a finished Run record and display? Define chars/min when Solutions differ per player (final Solution length vs keystrokes typed), how backspaces are counted, what's stored as a personal best and how (per Puzzle, in browser storage), the results screen, and the share-as-text format.

## Answer

A passed Run records:

- **Time**: first keystroke to passing tests (as before).
- **Words per minute** instead of chars/min: a word is a Space or Enter pressed straight after a character key. Repeated spaces, the auto-indent after Enter, and a space right after a Backspace don't count. WPM is words ÷ the Run's minutes.
- **Backspaces**: every Backspace key press, held-down repeats included.
- **The Solution's code**: the version that passed.

Counting uses the keys pressed, not the final text, so it measures the typing itself. Option/AltGr characters count as characters, since many layouts type symbols with them; shortcuts (Cmd or Ctrl) don't count.

The results line reads "Passed in 12.3 s, 42 wpm, 3 backspaces." Each passed Run is appended to browser storage (`localStorage["type-solution.runs"]`, as JSON). An Esc'd Run isn't recorded.

**Not decided yet:** personal bests (what "best" means across time, wpm and backspaces), a results screen beyond the status line, and the share-as-text format.
