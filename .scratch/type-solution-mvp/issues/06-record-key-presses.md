Status: ready-for-agent

# 06: Record key presses with their timings

## What to build

Each passed Run's saved record now also holds the sequence of key presses the player made: each one's character (what the browser typed, or Space / Enter / Tab / Backspace) and the milliseconds since the previous press. When browser storage is full, the oldest records lose their key presses but keep their summary, so the new Run still fits.

## Acceptance criteria

- [x] The editor shim reports every typed character itself (not just "a character"), plus Space, Enter, Tab and Backspace, each with a timestamp.
- [x] `A` and `a` are reported as different characters; Option/AltGr characters count; Cmd and Ctrl shortcuts aren't reported.
- [x] The Run keeps the sequence of presses; Words per minute and the Backspace count are worked out as before.
- [x] A passed Run's saved record includes the sequence (character plus milliseconds since the previous press). Presses after a pass aren't kept.
- [x] If storage is full, key presses are stripped from the oldest records until the new record fits; no record's summary is dropped. If storage can't be used at all, play goes on and the Run isn't kept.
- [x] Records without key presses (older ones, or stripped ones) still decode.
- [x] The Run state machine's tests cover the kept sequence and its timings, and the record carrying it.

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

## Comments

Decisions the ticket left open, made while building it:

- **The key press.** `Common.Run.Key` is `Character Char | Space | Enter | Tab | Backspace`. The event is `Pressed Millis Key`. Each key travels as a single character, in both the shim → Haskell call and the stored record (`keyChar` / `keyFromChar`). Character keys travel as themselves. Space, Enter, Tab and Backspace travel as `" "`, `"\n"`, `"\t"` and `"\b"`. The browser never reports these four as a one-character `e.key`, so there's no clash.
- **What the shim reports.** It reports `e.key` when that is one code point (an emoji counts), so `A` and `a` stay apart and Option/AltGr characters count. It also reports Enter, Tab (Shift+Tab too: it's a Tab key press) and Backspace. Held-down repeats count. Shortcuts follow the old rule, `metaKey || (ctrlKey && !altKey)`, and aren't reported. Nothing is reported while the editor is read-only: when the menu is open, Tab moves the focus and the Run ignores presses anyway.
- **Dead keys and input methods.** `isComposing`, `"Dead"` and `"Process"` aren't reported. On a dead-key layout, the dead key itself is never recorded. The character it makes (for example `é` from `´` then `e`) is recorded only if the browser doesn't mark that keydown as composing, and browsers differ here. So accented characters typed with dead keys may be missing from the sequence. They still reach the Solution, and the Words per minute and Backspace counts are unaffected (those keys are characters, not Space, Enter or Backspace).
- **Time source.** The time is `e.timeStamp` of the keydown: milliseconds, sub-millisecond, on the page's monotonic clock. It records when the key went down, so the delay of the wasm event loop can't creep into the gaps. In Haskell it's `Millis` (a `Double`) and is used only for differences. It's a different clock from the `UTCTime` on `Edited`/`Escaped`, so the two are never mixed. The Run keeps the raw `(Millis, Key)` presses, newest first. The record's gaps are worked out from those raw times when the record is made.
- **First press.** Its gap is 0. The Run's start comes from a different clock, and Hesitation ignores the first press anyway. The first press is usually the keydown that starts the Run: it arrives just before the edit it makes.
- **Pause gap.** The gap to the first press after a Pause includes the paused time. It isn't subtracted, because that would mix the two clocks. Ticket 08 ignores gaps over 1.5 s, which drops it in practice. Presses while Paused, after a skip, or after a pass aren't kept (ticket 05's rule stands).
- **Words per minute and Backspaces** are still running counts in the Run. "A word ends on Space or Enter straight after a character" now looks at the previous kept press. Tab never ends a word.
- **JSON shape.** There are two parallel fields, kept compact (about 5 bytes per press against about 10 for `[["a",120],…]`): `"keys"`, a string with one `keyChar` per press, and `"gaps"`, integer milliseconds since the previous press, rounded. Example: `"keys": "ab\bc\n", "gaps": [0,120,80,95,210]`. Both are always written. A record with neither (written before this ticket, or stripped) decodes with no key presses. A record with only one of the two, or with lengths that don't match, fails to decode: only this code writes them.
- **Storage full.** The logic is in `static/editor/src/storage.mjs`, imported by `editor.js` and bundled by esbuild as before. It is tested by `static/editor/test/storage.test.mjs` (`npm test --prefix static/editor`, `node --test`, no new dependencies) against a fake storage with a size quota. On a quota error it deletes `keys` and `gaps` from the oldest record that still has them, one record at a time, and retries. If nothing is left to strip, or the error isn't a quota error, or storage can't be read, it gives up without writing, so what was stored stays as it was. It never throws into Haskell. Records stored before this ticket have no presses, so they're skipped. Records whose stored value isn't a JSON list are left alone, not overwritten.
- **Build note.** After the change to `Common.Run`, the wasm half of the strict cabal build didn't rebuild `common` (stale `dist-wasm/.../common-0.1.0.0`). Deleting that cache folder fixed it.

Review evidence:

- `cabal test common` passes 68/68. The strict `-Werror` build (forced recompile) and `nix build` pass.
- `npm test --prefix static/editor` passes 6/6. A deliberate break (stripping the newest records first) fails 2 of them.
- `npm run check --prefix tools/puzzle-check` passes 50/50.
- Smoke test on the production build, headless Chrome:
  - The Reference Solution of a random Puzzle was typed with three mistakes fixed by Backspace and Shift-ed capitals, plus an arrow key and a Cmd shortcut (neither recorded). The saved record's `keys` matched the 160 reported presses exactly, with 160 gaps: the first 0, the rest 15–43 ms. `A` and `a` were kept apart. There were 5 Backspaces in both the summary and the sequence.
  - Storage filled to its 5,242,680-character limit with 516 fake records carrying presses. After a pass, only the oldest record (`fake0`) lost its presses. All 516 summaries survived, the new record was saved with its 143 presses, and play went on.

Closed on branch `type-solution-mvp` by the commit "Ticket 06: Record key presses with their timings". Status is left for the maintainer.

Review evidence:

- `cabal test common` passes 68/68, `npm test --prefix static/editor` passes 6/6, and the forced `-Werror` build and `nix build` pass.
- Making `step` drop presses fails 5 tests, among them "the Run keeps every key press…" and "A and a are kept as different characters". The suite passes again once restored.
- Smoke test on the production build:
  - All 160 presses typed are kept with their gaps, in order, and the 5 Backspaces match.
  - On a nearly full storage (516 records, about 5.2 M characters), the oldest record lost its key presses, every summary survived, and the new record was saved with its presses.
  - The console shows no errors.
