Status: ready-for-agent

# 04: Fill the launch bank to about 50 Puzzles

## What to build

Using the Puzzle authoring skill, grow the bank from the first batch to about 50 Puzzles, in batches of about ten, until every target symbol appears in at least 5 Reference Solutions.

## Acceptance criteria

- [x] The bank holds about 50 Puzzles, roughly 15 strings, 15 arrays, 10 numbers and conditions, 10 objects (a guideline, not a quota).
- [x] No two Puzzles are near-duplicates.
- [x] The Puzzle bank check passes, and its symbol report shows every target symbol in at least 5 Reference Solutions.

## Blocked by

- 03: Puzzle authoring skill and the first batch

## Notes for whoever implements it

- Follow the repo's Puzzle authoring skill; it holds every rule. Source: `.scratch/type-solution/spec.md`.
- Read the existing Puzzles' names and prompts before each batch.
- Fill symbol gaps by choosing problems that naturally need them, not by forcing symbols into a Puzzle.
- No human review step: commit each batch once the check passes. The maintainer reviews Puzzles afterwards and files new tickets for any changes.

## Comments

Decisions made while building it:

- **50 Puzzles, 39 new**, written in four batches (10, 10, 10, 9), with the check and its symbol report read after each one. Final split: strings 14, arrays 15, numbers and conditions 10, objects 11. `rockPaperScissors` and `triangleType` count as conditions; `topScorer`, `pick`, `getPath` and the other object-in Puzzles count as objects.
- **Symbol coverage met**: every target symbol is in at least 5 Reference Solutions. The thinnest are `!`, `` ` ``, `$`, `?` and `:` (5 each) and `"` (6). Gaps were filled by choosing problems that need the symbol: `-`/`*`/`/` from arithmetic (`differences`, `maskCard`, `dotProduct`, `percent`, `collatzSteps`, `digitSum`), `&&`/`||` from conditions (`rockPaperScissors`, `triangleType`, `isStrongPassword`, `gcd`) and `||` defaults (`groupByLength`, `mergeCounts`, `topScorer`), backticks and `$` from labels (`plural`, `wrapTag`, `abbreviate`, `queryString`), `?`/`:` from ternaries (`plural`, `baseName`, `collatzSteps`), and `!` from negation and `!==` (`unique`, `toggleFlags`, `slugify`, `collatzSteps`, `isLeapYear`).
- **Dropped or reshaped ideas.** `factorial` and `compare` (sign of a − b) fell under the 100-character minimum in their natural form: `factorial` was replaced by `collatzSteps` and `compare` dropped; `isValidTriangle` was too short and became `triangleType`; `gcd` uses the plain try-every-divisor loop, because Euclid's loop is under 100 characters. `longestWord`, `kebabToCamel`, `omit`, `fromPairs`, `oldest` and `countdown` were skipped as too close to `topScorer`, `slugify`, `pick`, `invert`, `topScorer` and `range`.
- **Results that would depend on key order are pinned in the prompt**: `queryString` sorts keys alphabetically, as its prompt says; `topScorer` promises distinct scores so no tie needs a rule.
- **Tests only check edge cases the prompt names**, as in ticket 03: drafts tested `pick` with no keys and `toggleFlags` with no names, which the prompts don't mention, so those tests were dropped. `flatten`'s prompt names "one level deep" because a test checks it.
- **Skill fix: `touch` does not make cabal see a new Puzzle file.** cabal-install 3.16 compares file contents, not times, and watches only the Puzzle files it found on the last build, so after `touch common/src/Common/Bank.hs` it still reported `common` "Up to date" and `cabal test common` failed with the old 11-Puzzle bank (`--ghc-options=-fforce-recomp` didn't help either: cabal ignores that flag when deciding what to rebuild). Removing `common`'s build record (`rm dist-newstyle/build/*/*/common-*/cache/build`) made it rebuild and the test pass. The skill now says that instead of `touch`.

Closed on branch `type-solution-mvp` by the commit "Ticket 04: Fill the launch bank to about 50 Puzzles". Status is left for the maintainer.

Review evidence: the check gives "OK: all 50 Puzzle file(s) pass." with no fewer-than-5 marks, and `cabal test common` passes 39/39. `nix build` passes, and the new Puzzles' Reference Solutions appear in the built frontend wasm (e.g. `function toggleFlags`). I confirmed the subagent's finding by measurement: after a Puzzle file is added, `touch common/src/Common/Bank.hs` leaves cabal "Up to date", while changing a common module's content rebuilds it. Ticket 01's comment, which said a touch was enough, is corrected in this commit. A harmless case: `queryString` asks for alphabetical keys, but arguments arrive with their keys already sorted, so a Solution that doesn't sort also passes.
