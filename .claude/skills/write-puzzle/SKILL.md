---
name: write-puzzle
description: Write new Puzzle files in puzzles/ for Type Solution. Use when asked to add, write or author Puzzles (e.g. "add 10 Puzzles").
---

# Write Puzzles

A Puzzle is a typing drill dressed as a programming problem: the player reads it, sees the approach at once, and types a Solution that passes hidden tests. Players practise a keyboard layout, so the typing is the challenge, never the solving. Domain words (see `CONTEXT.md`): Puzzle, Reference Solution, Solution, Run.

## Steps

1. **Survey the bank.** Read every file name and `prompt` in `puzzles/`, then run the check (below) and note the symbols its report marks. Done when you can list every existing Puzzle's idea.
2. **Pick a batch of ~10 ideas.** Each one easy (see Rules), not a near-duplicate of an existing Puzzle or another in the batch (same task with a new name counts as a duplicate), and with a natural Solution that needs symbols. Lean the batch toward the marked symbols. Spread it over the bank's split: strings ~15, arrays ~15, numbers and conditions ~10, objects ~10 out of ~50.
3. **Write one file per idea** following Format and Rules.
4. **Run the check until it passes** on the whole bank. Done when it exits 0.
5. **Commit the batch.** No human review comes first: the maintainer reviews Puzzles afterwards and files tickets for changes.

## The check

```sh
npm ci --prefix tools/puzzle-check && npm run check --prefix tools/puzzle-check
```

It runs every Reference Solution through the browser's test runner, enforces the length rule, and prints the symbol report. Details: `tools/puzzle-check/README.md`.

New Puzzle files and builds: a cabal dev build sees a *new* file only after a common module is touched (`touch common/src/Common/Bank.hs`); `nix build` sees only files git tracks, so `git add` it first. `cabal test common` fails if the bank and `puzzles/` differ.

## Format

Copy `puzzles/fizzBuzz.toml`. Keys: `function`, `signature`, `prompt`, `reference`, and `[[tests]]` blocks of `args` (a list) and `expected`; any other key fails the build.

- **Identity is the file name**: `chunk.toml` is the Puzzle `chunk`, and Personal bests key on it, so never rename a committed file. Name it after the function, camelCase.
- **`prompt`** is shown as one paragraph (line breaks render as spaces). Write it as `"""` text and end each line but the last with `\` so lines join, closing `"""` on the last line, so there is no trailing newline. A `"""` string processes escapes, so keep backslashes out of the prompt's words.
- **`reference`** goes in a `'''` literal string: no escapes, so the code is exactly what you see.

## Rules

**Length.** The Reference Solution is 4–12 non-blank lines and 100–350 characters, bounds inclusive. The check removes each line's leading whitespace (the editor auto-indents, so the player never types it), drops blank lines, and counts the code points left; line breaks don't count, trailing spaces do. Short is good: many short Runs suit layout practice.

**Easy.** The approach is obvious within ~5 seconds of reading the prompt; thinking time counts toward the Run.

**Pure functions.** Arguments in, a value out: no `console.log`, randomness, dates or time, async, or imports.

**Values.** Arguments and results are JSON values, never `null` (TOML has none). Tests compare results as JSON with object keys sorted, so `expected` never depends on object key order or floating-point rounding:
- Use integers, or round inside the function.
- Arguments reach the Solution with their object keys sorted, whatever the file's order, so a result never depends on an argument's key order (e.g. returning `Object.keys(obj)` as a list).

**Prompt.** One or two sentences plus one worked example, e.g. `chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]`. It describes the result, never the code ("use `.map`" gives the code away). It states every edge case a test checks.

**Tests.** 3–6 per Puzzle: typical cases plus the one or two edge cases the prompt names. No surprises: the failed-test list must never turn a Run into debugging.

**Symbols.** Target set: `{}[]()<>=!&|+-*/%'"` `` ` `` `$?:;,.`. The goal is every symbol in at least 5 Reference Solutions across the whole bank, read off the check's report. Reach it by choosing problems whose natural Solution uses the symbols and by writing references in varied natural styles (template literals, ternaries, arrows, single and double quotes). Coverage is judged over the bank, never as a per-Puzzle quota: a quota makes contrived Puzzles.
