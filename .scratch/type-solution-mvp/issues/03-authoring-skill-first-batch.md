Status: ready-for-agent

# 03: Puzzle authoring skill and the first batch

## What to build

A repo skill that a coding agent loads when asked to "add 10 Puzzles", carrying every rule for writing an acceptable Puzzle. Then use it to add the first batch of about ten Puzzles, which pass the Puzzle bank check.

## Acceptance criteria

- [ ] A repo skill for agents (e.g. `write-puzzle`) exists, whose description makes it load on requests to add or write Puzzles.
- [ ] It states: the file format (pointing at an existing Puzzle file as the example); identity is the file name; the length rule; easy difficulty; pure functions only; JSON values and no `null`; `expected` never depends on object key order or floating-point rounding; the prompt never gives the code away; one or two sentences plus one worked example; every tested edge case stated in the prompt; 3–6 tests; the target symbol set and the "each in at least 5 Reference Solutions across the bank" goal; read existing names and prompts first and skip near-duplicates; work in batches of ~10; run the Puzzle bank check before committing.
- [ ] About ten new Puzzles are added, spread across strings, arrays, numbers and conditions, and objects.
- [ ] The Puzzle bank check passes on the whole bank.
- [ ] The app builds and the new Puzzles load (each can be played by temporarily pointing the frontend at it, or after ticket 05 by New random Puzzle).

## Blocked by

- 02: Puzzle bank check

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` and `.scratch/type-solution/issues/12-grilling-authoring-guide-launch-bank.md` (the full rules, the launch-bank split and example Puzzle ideas).
- Use the `writing-for-agents` skill when writing the skill itself.
- Length rule: 4–12 non-blank lines and 100–350 characters, leading whitespace not counted (the editor auto-indents, so the player never types it). Many short Runs suit layout practice better than long ones.
- Easy means the approach is obvious within ~5 seconds of reading: the challenge is typing, not solving, and thinking time counts toward the Run.
- No hidden surprises: the failed-test list must never turn a Run into debugging.
- Pure functions: no `console.log`, randomness, dates or time, async, or imports.
- Pick problems whose natural Solution needs symbols, not only letters. Never force symbols in with per-Puzzle quotas; that makes contrived Puzzles.
- No human review step: commit once the check passes. The maintainer reviews Puzzles afterwards and files new tickets for any changes.
- Domain words: Puzzle, Reference Solution, Solution, Run.
