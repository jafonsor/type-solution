# Grilling: Puzzle authoring guide and the launch bank

Type: grilling
Status: resolved

## Question

What do coding agents get told when writing Puzzles, beyond the file format settled in "Grilling: Puzzle file format": how long a Solution should be, how hard, which JavaScript features and symbols it should make the player type (layout practice needs brackets, operators and quotes, not just letters), how many tests and which edge cases? And what does the bank look like at launch: how many Puzzles, covering which topics?

## Answer

**The guide is a repo skill** (e.g. `.claude/skills/write-puzzle/SKILL.md`), written for the coding agents that add Puzzles, so "add 10 Puzzles" loads it. It tells the agent:

**Length.** The reference Solution is 4–12 non-blank lines and 100–350 characters, counted with each line's leading whitespace removed (the editor auto-indents, so the player never types it). Hard rule: the check fails a Puzzle outside the range. Many short Runs suit layout practice better than long ones.

**Difficulty.** Easy: the approach should be obvious within ~5 seconds of reading the prompt. The challenge is typing it, not solving it (thinking time counts toward the Run).

**What a Puzzle may be.**
- A pure function: arguments in, a value out. No `console.log`, randomness, dates or time, async, or imports.
- Arguments and results are JSON values, never `null` (already true because of the format).
- `expected` never depends on object key order or floating-point rounding (use integers, or round inside the function).
- The prompt never gives away the code (no "use `.map`").

**Prompt.** One or two sentences plus one worked example in the prompt text, e.g. `chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]]`. Every edge case a test checks is stated in the prompt.

**Tests.** 3–6 per Puzzle: typical cases plus the one or two edge cases the prompt names. No hidden surprises: the failed-test list should never turn a Run into debugging.

**Symbols.** Choose problems whose natural Solution needs symbols, not just letters. Target set: `{}[]()<>=!&|+-*/%'"` `` ` `` `$?:;,.`. The reference check also prints how often each target symbol appears across all reference Solutions (report only, not a failure). The guide asks for every symbol in at least 5 references, and the agent fills gaps before finishing. Coverage is judged over the whole bank, never by per-Puzzle quotas, which would produce contrived problems.

**Launch bank: ~50 Puzzles**, split as a guideline rather than a quota:
- Strings (reverse words, capitalise, count vowels, formatted labels…): ~15
- Arrays (sum, filter evens, flatten one level, chunk, zip…): ~15
- Numbers/conditions (fizzBuzz, clamp, leap year, digit sum…): ~10
- Objects (count occurrences, pick keys, invert…): ~10

**Accepting Puzzles.** The agent first reads the existing `puzzles/` names and prompts and skips near-duplicates. It adds Puzzles in batches of ~10. The reference and length checks must pass. The human skims each batch (prompt plus reference) before it's committed.

**Weak-key Puzzle choice** (the map's deferred fog) is ruled out of scope for the MVP. Random choice ships; with ~50 Puzzles and 20-Run stats the data is thin, and the weak-key lists already show players their weak keys.

## Comments

- The human-skim step was dropped in favour of committing a batch once the Puzzle bank check passes and reviewing Puzzles afterwards (decided 2026-10-18 while implementing the MVP spec).
