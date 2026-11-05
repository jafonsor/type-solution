Type: task
Status: ready-for-agent
Blocked by: 23

# 24: Write the remaining PureScript Reference Solutions

## What to build

The other Puzzles (the 31 plain ones and the 7 `Object a` ones, minus any done in ticket 23). Use the `write-puzzle` skill's style rules adapted to PureScript, one-line imports only. Tune the PureScript symbol list and length limits from the real Solutions (spec, "Bank").

## Acceptance

- All 50 Puzzles have a `[purescript]` table; `npm run check` and `npm run solutions` pass (with `PURS_WASM` set).
- The symbol coverage table per Language is printed and the goal (5 Solutions per symbol) is met or the gaps are reported.
