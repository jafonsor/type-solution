Type: task
Status: ready-for-agent
Blocked by: 22; needs a `purs-core.wasm` (ticket 21 shows how to run one)

# 23: Write the PureScript Reference Solutions that might not type: prove the approach

## What to build

Build order step 1, riskiest first. Write and compile with the wasm compiler, puzzle-check as judge: `getPath` (`Json`), the 8 polymorphic-list Puzzles (`chunk`, `everyOther`, `positions`, `rotate`, `unique`, `grid`, `flatten`, `zip`), the 4 mixed-value-object Puzzles (`pick`, `queryString`, `withDefaults`, `getPath`). Settle the unverified items in spec "Calling convention": the `Type.Proxy` module name, dictionary passing for `Eq a =>` (`unique`, `positions`), the runtime shape of `Tuple` (ticket 21's worker assumes a class named `Tuple` with `value0` and `value1`).

## Acceptance

- Each of these Puzzles has a `[purescript]` table that passes `npm run solutions`.
- Any Puzzle that cannot be typed is reported to the owner with the options in the spec (change its tests for every Language, or hold PureScript back).
- The calling-convention notes are corrected in the spec and the runner if the guesses were wrong.
- Libraries these need are listed for ticket 25.
