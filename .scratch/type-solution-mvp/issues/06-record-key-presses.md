Status: ready-for-agent

# 06: Record key presses with their timings

## What to build

Each passed Run's saved record now also holds the sequence of key presses the player made: each one's character (what the browser typed, or Space / Enter / Tab / Backspace) and the milliseconds since the previous press. When browser storage is full, the oldest records lose their key presses but keep their summary, so the new Run still fits.

## Acceptance criteria

- [ ] The editor shim reports every typed character itself (not just "a character"), plus Space, Enter, Tab and Backspace, each with a timestamp.
- [ ] `A` and `a` are reported as different characters; Option/AltGr characters count; Cmd and Ctrl shortcuts aren't reported.
- [ ] The Run keeps the sequence of presses; Words per minute and the Backspace count are worked out as before.
- [ ] A passed Run's saved record includes the sequence (character plus milliseconds since the previous press). Presses after a pass aren't kept.
- [ ] If storage is full, key presses are stripped from the oldest records until the new record fits; no record's summary is dropped. If storage can't be used at all, play goes on and the Run isn't kept.
- [ ] Records without key presses (older ones, or stripped ones) still decode.
- [ ] The Run state machine's tests cover the kept sequence and its timings, and the record carrying it.

## Blocked by

- 01: Puzzles come from TOML files at build time

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` ("History and stats"); decided in `.scratch/type-solution/issues/10-grilling-per-key-mistakes.md`.
- The character is what the browser types, not the physical key position: the player's layout is unknown, and that's the whole point (layout practice).
- Everything else (Corrections, Hesitation, pairs later) is derived from the raw sequence, so store raw presses, not scores.
- Today the shim's key handler maps a key to one of "character" / "space" / "enter" / "backspace", and the Haskell side has a `Key` type with no character. Both need the character and Tab added. Keep the existing rule that a word ends on Space or Enter straight after a character.
- Times in the state machine come in on events (as `Edited` carries its time), never read from the clock, so tests stay deterministic.
- Stripping old key presses keeps Personal bests (ticket 07) intact, since they only need the summary.
- Ticket 05 also changes the Run state machine and may run at the same time; expect a small merge.
- Domain words: Run, Correction, Hesitation (for later use; this ticket only records).
