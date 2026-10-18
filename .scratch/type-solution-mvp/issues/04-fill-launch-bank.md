Status: ready-for-agent

# 04: Fill the launch bank to about 50 Puzzles

## What to build

Using the Puzzle authoring skill, grow the bank from the first batch to about 50 Puzzles, in batches of about ten, until every target symbol appears in at least 5 Reference Solutions.

## Acceptance criteria

- [ ] The bank holds about 50 Puzzles, roughly 15 strings, 15 arrays, 10 numbers and conditions, 10 objects (a guideline, not a quota).
- [ ] No two Puzzles are near-duplicates.
- [ ] The Puzzle bank check passes, and its symbol report shows every target symbol in at least 5 Reference Solutions.

## Blocked by

- 03: Puzzle authoring skill and the first batch

## Notes for whoever implements it

- Follow the repo's Puzzle authoring skill; it holds every rule. Source: `.scratch/type-solution/spec.md`.
- Read the existing Puzzles' names and prompts before each batch.
- Fill symbol gaps by choosing problems that naturally need them, not by forcing symbols into a Puzzle.
- No human review step: commit each batch once the check passes. The maintainer reviews Puzzles afterwards and files new tickets for any changes.
