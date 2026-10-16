# Type Solution

A typing-practice game for developers: instead of retyping shown text, the player types code that solves a small programming problem.

## Language

**Correction**:
A character typed straight after one or two Backspaces, counted as a miss of that character: it is what the player was aiming for. Three or more Backspaces in a row is a rewrite, not a Correction.
_Avoid_: Error, typo, mistake

**Hesitation**:
The time before a key press, measured from the previous one; gaps over 1.5 s are thinking, not Hesitation.
_Avoid_: Latency, delay, reaction time

**Pause**:
A stop in a Run, started and ended by the player; paused time doesn't count toward the Run's time or Words per minute.
_Avoid_: Break, hold

**Personal best**:
The fastest passed Run on a Puzzle, in this browser.
_Avoid_: High score, record, PB

**Puzzle**:
A small programming problem shown to the player, paired with hidden tests that decide whether a Solution is correct.
_Avoid_: Challenge, kata, exercise, problem

**Reference Solution**:
A working Solution written alongside a Puzzle, never shown to the player, that proves the Puzzle's tests can be passed.
_Avoid_: Answer key, model answer

**Run**:
One timed attempt at a single Puzzle, from the first keystroke until the Solution passes, not counting Pauses. A Run given up from a Pause isn't recorded.
_Avoid_: Session, game, round, heat

**Solution**:
The code the player types during a Run.
_Avoid_: Answer, attempt, submission

**Words per minute**:
How fast a Run's Solution was typed: each Space or Enter pressed straight after a character key is a word, divided by the Run's minutes.
_Avoid_: WPM as chars ÷ 5, typing speed
