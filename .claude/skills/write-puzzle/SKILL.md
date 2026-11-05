---
name: write-puzzle
description: Write new Puzzle files in puzzles/ for Type Solution. Use when asked to add, write or author Puzzles (e.g. "add 10 Puzzles").
---

# Write Puzzles

A Puzzle is a typing drill dressed as a programming problem: the player reads it, sees the approach at once, and types a Solution that passes hidden tests. Players practise a keyboard layout, so the typing is the challenge, never the solving. Domain words (see `CONTEXT.md`): Puzzle, Reference Solution, Solution, Language, Run, Peek.

A Puzzle has one prompt and one set of tests, shared by every Language, and a signature and Reference Solution in each Language. Each Language keeps its own rules in `languages/<name>/`; this skill holds only what is common.

## Steps

1. **Read every Language's folder.** For each `languages/<name>/`: `language.json` (length limits, symbols), `authoring.md`, `calling-convention.md`. Done when you can state each Language's limits and traps.
2. **Survey the bank.** Read every file name and `prompt` in `puzzles/`, then run the check (below) and note, in each Language's table, the symbols it marks. Done when you can list every existing Puzzle's idea.
3. **Pick a batch of ~10 ideas.** Each one easy (see Rules), not a near-duplicate of an existing Puzzle or another in the batch (same task with a new name counts as a duplicate), and with a natural Solution in every Language that needs symbols. Lean the batch toward the marked symbols. Spread it over the bank's split: strings ~15, arrays ~15, numbers and conditions ~10, objects ~10 out of ~50.
4. **Write one file per idea** following Format and Rules, with a Reference Solution in every Language folder. A Puzzle one Language cannot express naturally is a different idea.
5. **Run the check until it passes** on the whole bank. Done when it exits 0 and each Language's Reference Solutions pass its own runner (`npm run solutions`, see `tools/puzzle-check/README.md`).
6. **Commit the batch.** No human review comes first: the maintainer reviews Puzzles afterwards and files tickets for changes.

## The check

```sh
npm ci --prefix tools/puzzle-check && npm run check --prefix tools/puzzle-check
```

It reads every `languages/<name>/`, enforces each Language's length limits and import rules, lints the prompt, runs the JavaScript Reference Solutions through the browser's test runner, and prints one symbol table per Language. Details, including how to run every Language's Solutions: `tools/puzzle-check/README.md`.

New Puzzle files and builds: a cabal dev build sees a *new* file only after `common` rebuilds, and cabal watches only the Puzzle files it saw last time and compares contents, not times, so `touch` is not enough. Remove `common`'s build record first: `rm dist-newstyle/build/*/*/common-*/cache/build`. `nix build` sees only files git tracks, so `git add` it first. `cabal test common` fails if the bank and `puzzles/` differ.

## Format

Copy `puzzles/fizzBuzz.toml`. Top-level keys: `function`, `prompt`, and `[[tests]]` blocks of `args` (a list) and `expected`. Then one table per folder in `languages/`, named after it (`[javascript]`, `[purescript]`, ...), each with `signature` and `reference`; a missing, unknown or placeholder table, or any other key, fails the check or the build.

- **Identity is the file name**: `chunk.toml` is the Puzzle `chunk`, and Personal bests key on it, so never rename a committed file. Name it after the function, camelCase.
- **`prompt`** is shown as one paragraph (line breaks render as spaces). Write it as `"""` text and end each line but the last with `\` so lines join, closing `"""` on the last line, so there is no trailing newline. A `"""` string processes escapes, so keep backslashes out of the prompt's words.
- **`reference`** goes in a `'''` literal string: no escapes, so the code is exactly what you see.

## Rules

**Easy.** The approach is obvious within ~5 seconds of reading the prompt; thinking time counts toward the Run. Short is good: many short Runs suit layout practice.

**Peeking.** Write each Reference Solution the way you would want to read it when stuck: the player sees it on hover mid-Run.

**Values.** Arguments and results are JSON values, never `null` (TOML has none). Tests compare results as JSON with object keys sorted, so `expected` never depends on object key order or floating-point rounding: use integers, or round inside the function.

**Prompt.** One or two sentences plus one worked example written as plain input → output, e.g. `[1,2,3,4,5], 2 → [[1,2],[3,4],[5]]` or `"internationalization" → "i18n"`, never a call in any Language's syntax (the check fails `chunk(…)`, arrows and the like). It describes the result, never the code ("use `.map`" gives the code away). It states every edge case a test checks.

**Tests.** 3–6 per Puzzle: typical cases plus the one or two edge cases the prompt names. No surprises: the failed-test list must never turn a Run into debugging.

**Symbols.** Each Language's table in the check's report marks the symbols found in fewer than 5 of that Language's Reference Solutions; the goal is none marked. Reach it by choosing problems whose natural Solution uses the symbols, and by writing references in varied natural styles. Coverage is judged over the bank, per Language, never as a per-Puzzle quota: a quota makes contrived Puzzles.
