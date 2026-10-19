Status: ready-for-agent

# 03: Puzzle authoring skill and the first batch

## What to build

A repo skill that a coding agent loads when asked to "add 10 Puzzles", carrying every rule for writing an acceptable Puzzle. Then use it to add the first batch of about ten Puzzles, which pass the Puzzle bank check.

## Acceptance criteria

- [x] A repo skill for agents (e.g. `write-puzzle`) exists, whose description makes it load on requests to add or write Puzzles.
- [x] It states: the file format (pointing at an existing Puzzle file as the example); identity is the file name; the length rule; easy difficulty; pure functions only; JSON values and no `null`; `expected` never depends on object key order or floating-point rounding; the prompt never gives the code away; one or two sentences plus one worked example; every tested edge case stated in the prompt; 3–6 tests; the target symbol set and the "each in at least 5 Reference Solutions across the bank" goal; read existing names and prompts first and skip near-duplicates; work in batches of ~10; run the Puzzle bank check before committing.
- [x] About ten new Puzzles are added, spread across strings, arrays, numbers and conditions, and objects.
- [x] The Puzzle bank check passes on the whole bank.
- [x] The app builds and the new Puzzles load (each can be played by temporarily pointing the frontend at it, or after ticket 05 by New random Puzzle).

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

## Comments

Decisions made while building it:

- **The skill** is `.claude/skills/write-puzzle/SKILL.md`, model-invoked (its description fires on requests to add, write or author Puzzles): five steps (survey the bank, pick ~10 ideas, write, run the check until it passes, commit) plus Format and Rules. It states the no-review rule; the spec's user story 76 and authoring-skill bullet, and decision ticket 12, were updated to match in the same commit.
- **Prompts render as one paragraph** (`<p>` text, so line breaks show as spaces). Prompt lines therefore end in `\` inside `"""`, with the closing `"""` on the last line, so there is no trailing newline. A new test fails any prompt with leading or trailing whitespace.
- **Object key order (found in review).** The app reads TOML tables into sorted maps (toml-parser, then aeson's KeyMap), so the browser's request carries object keys sorted, not in the file's order; the check used smol-toml's file order, so it passed countWords and invert while a player typing their Reference Solutions could not pass them. Fixed: `static/src/js/runner.js` now compares results as JSON with object keys sorted recursively (`got` is still shown as is), and the check sends arguments and expected values sorted the same way, so it runs what the browser runs. Self-tests cover an unsorted result passing and a result that depends on the arguments' key order failing; a common test pins `checkRequest`'s sorted order. The skill's Values rule and the two prompts no longer promise a key order.
- **Tests only check edge cases the prompt names.** Drafts tested `chunk([], 2)`, `runningTotal([])` and `formatTime(3601) → "60:01"` (minutes past an hour); the prompts didn't name them, so those tests were dropped rather than lengthening the prompts.
- **The bank is proven from the folder**: a new test in `common/test/Main.hs` lists `../puzzles/*.toml` at run time (cabal runs tests in `common/`) and requires the bank's identities to equal the file names. Shown red by adding an untouched copy of a file in a dev build (bank lacked `zzTemp`). The test suite gains `directory` and `filepath`.
- **`nix build` sees only git-tracked files** (it builds the flake's git source), so a new, unstaged Puzzle file is silently absent from the production bundle. The skill says to `git add` before `nix build`.
- **Symbol coverage is not yet met**: with 11 Reference Solutions, most target symbols are in fewer than 5 (`-` and `*` in none). The goal is bank-wide over ~50 Puzzles; ticket 04 should lean toward the marked symbols.

Closed on branch `type-solution-mvp` by the commit "Ticket 03: Puzzle authoring skill and the first batch". Status is left for the maintainer.

Review evidence: in review, `checkRequest` (`cabal repl common`) showed that the browser receives object keys sorted. Fed that request, `runner.js` failed countWords' and invert's own Reference Solutions: 3 of 6 tests. After the fix the same probe passes 6/6. The check passes 11/11, its self-tests 25/25, and `cabal test common` 39/39. A browser smoke test with the frontend temporarily on countWords passed ("Passed in 3.0 s …").
