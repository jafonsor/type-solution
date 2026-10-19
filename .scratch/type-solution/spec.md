# Spec: Type Solution MVP

Status: ready-for-agent

Map: [map.md](map.md). Every decision below comes from the map's resolved tickets; the ticket is linked where it adds detail.

## Design Contract

Rules every spec and build decision must keep. Breaking one means stopping to ask.

- **I1 — The player solves, never copies.** The screen shows only the Puzzle; the player types any JavaScript Solution that passes its hidden tests. The tests' code and the Reference Solution are never shown; a failed test may show its call, its expected value and what the Solution returned.
- **I2 — Practice comes first.** The game exists to practise a keyboard layout; code Puzzles are the wrapper. The editor gives syntax highlighting and auto-indent only: no auto-closing brackets, no suggestions or autocomplete, nothing that types for the player.
- **I3 — One Puzzle per Run, ended by passing.** The clock runs from the first keystroke until the tests pass, minus Pauses. Tests re-run when typing pauses; the Run ends by itself on a pass, with no submit key. A Run given up from a Pause isn't recorded.
- **I4 — No server.** The app is static files only; there is no server-side game logic, no accounts and no global leaderboards. Player code runs only in the player's browser, in a Web Worker that is stopped on a ~1 s timeout.
- **I5 — Results stay in this browser.** Runs, their key presses, Personal bests and weak-key stats are kept in the player's own browser storage and never leave it.
- **I6 — Puzzles are hand-made files.** Each Puzzle is a TOML file in the repo, read in when the app is built, with a Reference Solution that passes its tests. The app never calls an LLM and players can't author Puzzles.
- **I7 — JavaScript only.** Solutions are JavaScript; no other language is offered.
- **I8 — The chosen stack.** reflex-dom on Obelisk v2, compiled to WebAssembly, with CodeMirror 6 behind a thin JS shim and a plain-JS test-runner worker; built by GitHub Actions and served by GitHub Pages.

## Problem Statement

A developer learning a new keyboard layout (Colemak, Dvorak, a split board's own layout) needs a lot of typing practice, and the usual typing trainers have them retype prose or shown text. That trains letters but barely touches the symbols code is full of (`{}[]()=>;"'`), and copying shown text is dull for someone who writes code all day. They want practice that feels like programming, drills the keys they actually use, and tells them which keys are still slowing them down.

## Solution

Type Solution is a free web game at `jafonsor.github.io/type-solution`. The player sees a small programming problem (a Puzzle: a function heading, one or two sentences and one example) and types any JavaScript Solution they like. Whenever they stop typing for a moment, the game runs the Solution against the Puzzle's hidden tests in their own browser and lists any failed tests below the editor. The moment every test passes, the Run ends by itself and shows the time, words per minute and Backspace count, and how that compares with the player's Personal best on that Puzzle. Below the editor, two lines show the characters the player misses most and types slowest across their recent Runs. Esc pauses a Run; a small menu then offers a new random Puzzle or the same one again. There are no accounts. Everything is kept in the player's browser.

Today one Puzzle (fizzBuzz) already plays end to end: editor, live checks, timer, words per minute and Backspaces, and Runs saved to browser storage. This spec covers the rest: a bank of about 50 Puzzle files, Pause and the menu, Personal bests, per-key stats, and deployment.

## User Stories

**Starting a Run**

1. As a player, I want the page to open straight onto a Puzzle with the editor focused, so that I can start practising without clicking anything.
2. As a player, I want to see the Puzzle's function heading (e.g. `chunk(arr, size)`), a one- or two-sentence description and one worked example, so that I know what to write within a few seconds.
3. As a player, I want every edge case the tests check to be stated in the description, so that a Run never turns into guessing what the hidden tests want.
4. As a player, I want the clock to start on my first keystroke, not when the page loads, so that reading the Puzzle costs me nothing.
5. As a player, I want the status line to tell me the clock starts on my first keystroke, so that I don't feel rushed while reading.
6. As a player, I want the first Puzzle to be chosen at random from the bank, so that each visit feels fresh.

**Typing**

7. As a player practising a layout, I want the editor to highlight JavaScript syntax, so that I can read my own code as I type it.
8. As a player, I want the editor to auto-indent new lines, so that I don't spend keystrokes on leading whitespace the game doesn't count.
9. As a player practising a layout, I want the editor never to auto-close brackets or quotes, so that I type every symbol myself.
10. As a player practising a layout, I want no suggestions or autocomplete, so that Tab and Enter always do what they say and nothing types for me.
11. As a player, I want Tab to indent while I'm typing, so that I can fix indentation the auto-indent got wrong.
12. As a player whose layout types symbols with Option or AltGr, I want those characters to count as typing, so that my layout's symbol layer is measured fairly.
13. As a player, I want shortcuts (Cmd or Ctrl combinations) not to count as typing, so that undo or select-all doesn't skew my stats.
14. As a player, I want to write any working Solution (a loop, a `.map`, a regex), so that I'm solving, not copying.

**Checking**

15. As a player, I want my Solution checked automatically 400 ms after I stop typing, so that I never press a submit key.
16. As a player, I want the status line to show "checking…" while a check runs, so that I know the game is working.
17. As a player, I want each failed test listed below the editor as "`fizzBuzz(10)` should return `"Buzz"`, got `"10"`", so that I can fix the case I got wrong.
18. As a player, I want a syntax error shown as such, so that I know my code doesn't parse yet rather than that it's wrong.
19. As a player, I want an exception my code throws shown as its message, so that I can find the crash.
20. As a player who wrote an endless loop, I want the check stopped after about one second with "Stopped after 1.0 s: an infinite loop?", so that the page never freezes.
21. As a player, I want the status line to say how many tests pass (e.g. "2/4 tests pass"), so that I can see my progress.
22. As a player, I want the last check's feedback to stay visible while I type again, so that I can read it while fixing the code.
23. As a player, I want a check made outdated by further typing to be dropped, so that I never see feedback for code I've already changed.
24. As a player, I never want to see the tests' code or the Reference Solution, so that I solve the Puzzle myself.

**Passing**

25. As a player, I want the Run to end the moment every test passes, so that my time is exactly my typing and thinking time.
26. As a player, I want the clock to freeze on a pass, so that I can see my final time.
27. As a player, I want the status line after a pass to read "Passed in 12.3 s, 42 wpm, 3 backspaces.", so that I see my headline numbers at once.
28. As a player passing a Puzzle for the first time, I want "First time on this Puzzle." added, so that I know there's nothing to compare with yet.
29. As a player who beat their Personal best, I want "New best (was 14.0 s)." added, so that I can see the improvement.
30. As a player who didn't beat their best, I want "Best: 12.3 s." added, so that I know the time to beat.
31. As a player, I don't want my best shown during a Run, so that I focus on typing, not the clock.
32. As a player, I want words per minute to count a word each time I press Space or Enter straight after a character, so that spaces in code and the auto-indent don't inflate my speed.
33. As a player, I want every Backspace press counted, held-down repeats included, so that the count is honest about how much I fixed.
34. As a player, I want the editor to stop taking input once I've passed, so that stray keys don't change the passing Solution.
35. As a player, I want the game to stay on my finished Run until I choose what's next, so that I have time to look at my result.

**The menu**

36. As a player, I want a menu with two icon buttons, New random Puzzle and Repeat Puzzle, to open after a pass, so that I choose what comes next.
37. As a player, I want each button to have a tooltip, so that I know what the icons mean.
38. As a keyboard-only player, I want Tab and Shift+Tab to move between the buttons and Enter or Space to press one, so that I never reach for the mouse.
39. As a player, I want either button to start a new Run with an empty editor, so that each Run starts clean.
40. As a player who wants to beat a time, I want Repeat Puzzle to give me the same Puzzle again, so that I can practise it.
41. As a player, I want New random Puzzle to pick at random from the whole bank, so that I keep meeting different symbols.
42. As a player, I want the menu to sit below the status line and above the weak-key lists, so that the layout stays the same from Run to Run.

**Skipping and pausing**

43. As a player who doesn't fancy a Puzzle, I want Esc before my first keystroke to open the menu with "Skipped.", so that I can skip without typing anything.
44. As a player who gets interrupted, I want Esc during a Run to pause it: the clock stops, the editor freezes, and the status line reads "Paused. Esc to carry on.", so that the interruption doesn't count.
45. As a paused player, I want Esc again to close the menu, focus the editor and carry on, so that I resume exactly where I was.
46. As a player, I want paused time left out of the Run's time and its words per minute, so that a Pause never hurts my numbers.
47. As a paused player, I want choosing a menu button to give up the Run without recording it, so that an abandoned Run doesn't pollute my history.
48. As a player who pressed Esc while a check was running, I want that check to still count, so that if it passes my Run ends as passed at the paused time.
49. As a player with the menu open after a pass or a skip, I want Esc to do nothing, so that I can't start or resume something by accident.

**Results and weak keys**

50. As a player, I want every passed Run kept in my browser (its time, words per minute, Backspaces, the passing Solution and the key presses with their timings), so that my history and stats build up over time.
51. As a privacy-minded player, I want none of my Runs or keystrokes to leave my browser, so that I can practise without an account and without being tracked.
52. As a player, I want my Personal best on each Puzzle to be my fastest passed Run on it, with that Run's words per minute and Backspaces, so that "best" means one clear thing.
53. As a player practising a layout, I want a "Most missed: …" line below the editor listing the five characters I most often corrected, so that I know which keys to practise.
54. As a player practising a layout, I want a "Slowest: …" line listing the five characters with the highest median Hesitation, so that I know which keys I still search for.
55. As a player, I want a character counted as missed when I type it straight after one or two Backspaces, so that the game learns what I was aiming for.
56. As a player who deletes a whole word and retypes it, I want three or more Backspaces in a row to count as a rewrite, not a Correction, so that rethinking code doesn't count against a key.
57. As a player, I want gaps over 1.5 s left out of Hesitation, so that thinking about the problem doesn't make a key look slow.
58. As a player, I want `A` and `a` counted as different characters, so that my Shift use is part of what's measured.
59. As a player, I want the weak-key lists to use only my last 20 passed Runs, so that they show how I type now, not weeks ago.
60. As a player, I want a character to appear in a list only once I've typed it at least 10 times in those Runs, so that one slip doesn't put a key at the top.
61. As a player, I want Space, Enter and Tab kept out of the lists, so that they show the keys my layout makes hard.
62. As a new player, I want the lists to stay empty until some character has enough data, so that I'm not shown noise.
63. As a player, I want both lists refreshed after each passed Run, so that I see the effect of my practice straight away.
64. As a player whose browser storage is filling up, I want the oldest Runs to drop their key presses but keep their summary, so that my Personal bests survive.
65. As a player in a private window or with site data blocked, I want the game to work anyway, just without keeping Runs, so that storage trouble never breaks play.

**The Puzzle bank**

66. As a player, I want about 50 Puzzles at launch across strings, arrays, numbers and conditions, and objects, so that I don't repeat the same ones soon.
67. As a player, I want each Puzzle to be easy (the approach obvious within about five seconds), so that the challenge is typing, not solving.
68. As a player, I want each Solution to be short (about 4–12 lines), so that I get many short Runs.
69. As a player practising a layout, I want the bank as a whole to make me type every common code symbol often, so that my symbol layer gets real practice.
70. As a coding agent asked to add Puzzles, I want a repo skill that states the format, length, difficulty, prompt, test and symbol rules, so that I can write acceptable Puzzles without asking.
71. As a coding agent, I want one TOML file per Puzzle, with multi-line strings for the prompt and the Reference Solution, so that the files are easy to write and review.
72. As a coding agent, I want a check that runs every Reference Solution against its tests through the same runner the browser uses, so that I can't ship a Puzzle nobody can pass.
73. As a coding agent, I want the check to fail a Puzzle whose Reference Solution is outside 4–12 non-blank lines or 100–350 characters (leading whitespace not counted), so that the length rule is enforced, not just suggested.
74. As a coding agent, I want the check to report how often each target symbol appears across all Reference Solutions, so that I can fill coverage gaps before finishing a batch.
75. As a coding agent, I want to see the existing Puzzles' names and prompts before adding more, so that I don't write near-duplicates.
76. As the maintainer, I want Puzzles added in batches of about ten, committed once the Puzzle bank check passes and reviewed by me afterwards (I file new tickets for changes), so that the bank grows without waiting on me.
77. As the maintainer, I want a malformed Puzzle file to fail the build or the Puzzle bank check, so that a broken Puzzle never reaches players.
78. As the maintainer, I want a Puzzle's identity to be its file name, so that renaming the function inside it doesn't orphan its Personal bests.

**Hosting**

79. As a player, I want to reach the game at `jafonsor.github.io/type-solution` over HTTPS, so that I can just open a link.
80. As a player on a slow connection, I want the page to paint a loading state before the app finishes loading, so that I'm not staring at a blank screen.
81. As the maintainer, I want every push to `main` to build and deploy the site through GitHub Actions, so that releasing takes no manual steps.
82. As the maintainer, I want the deploy to be a single commit force-pushed to `gh-pages`, so that old builds don't pile up and any old build can be rebuilt from its `main` commit.
83. As the maintainer, I want production to be static files with no server running, so that there's nothing to keep up.
84. As the maintainer, I want the Puzzle bank check to run in CI, so that a pushed Puzzle that fails it never deploys.

## Implementation Decisions

**Puzzles**

- **Puzzle files.** A top-level puzzles folder holds one TOML file per Puzzle. Fields: `function` (the name the Solution must define and the tests call), `signature` (the heading shown), `prompt` (one or two sentences plus one worked example), `reference` (the Reference Solution, a multi-line string) and `tests`, a list of `[[tests]]` blocks each with `args` (a list) and `expected`, both JSON values. No `null` anywhere (TOML has none), no starter code, no tags, no difficulty. See [Grilling: Puzzle file format](issues/05-grilling-puzzle-format.md). (I6, I7)
- **Identity is the file name.** `fizzBuzz.toml` is the Puzzle `fizzBuzz`. The Puzzle type gains an identity field taken from the file name; Runs and Personal bests key on it, not on the function name, and two Puzzles may share a function name. The fizzBuzz Runs already stored keep matching because both names are `fizzBuzz`. (I6, I5)
- **The bank is read in at build time.** A Template Haskell splice reads every file in the puzzles folder and embeds the bank in the app; parsing TOML inside the splice is preferred, so that a broken file is a build error. Use `toml-parser` (pure Haskell, TOML 1.0) if the pinned package set has it; otherwise embed the text and parse at startup. In that case the Puzzle bank check, which parses every file, is what stops a malformed file: it runs before the build in CI, so a broken file still never deploys. The hard-coded fizzBuzz value is replaced by a fizzBuzz Puzzle file. The Reference Solution and the tests travel in the bundle (the worker needs the tests), but nothing in the app ever renders either. (I6, I1)
- **The Puzzle bank check** is a Node command run locally and in CI. For every Puzzle file it (a) runs the Reference Solution against the tests through the browser's own test-runner script, unchanged, and fails if any test fails; (b) fails if the Reference Solution is outside 4–12 non-blank lines or 100–350 characters, counted with each line's leading whitespace removed; (c) prints, as a report that never fails, how often each target symbol appears across all Reference Solutions. Target symbols: `{}[]()<>=!&|+-*/%'"` `` ` `` `$?:;,.`. (I6, I1)
- **The authoring skill** is a repo skill for coding agents ("add 10 Puzzles" loads it). It carries the rules of [Grilling: Puzzle authoring guide and the launch bank](issues/12-grilling-authoring-guide-launch-bank.md): pure functions only (no console output, randomness, dates, async or imports); `expected` never depends on object key order or floating-point rounding; the prompt never gives the code away; every tested edge case is in the prompt; 3–6 tests; read existing names and prompts first and skip near-duplicates; batches of ~10; the check must pass; every target symbol in at least 5 Reference Solutions across the bank, never as a per-Puzzle quota; a batch is committed once the check passes, with no human review first: the maintainer reviews Puzzles afterwards and files new tickets for changes. (I6)
- **The launch bank** is ~50 Puzzles: about 15 strings, 15 arrays, 10 numbers and conditions, and 10 objects (a guideline, not a quota). (I6, I2)

**The Run**

- **The Run stays a pure state machine** fed by events from the browser, extended as follows (from [Grilling: personal bests, the results screen and sharing](issues/11-grilling-bests-results-sharing.md) and [Grilling: per-key mistakes and weak-key practice](issues/10-grilling-per-key-mistakes.md)):
  - A key-press event carries the character the browser typed (or Space / Enter / Tab / Backspace) and the time it was pressed. The Run keeps the raw sequence of these presses; words typed and Backspaces are still counted as now.
  - Phases gain **Paused** and **Skipped**. Esc in *not started* goes to Skipped; Esc while typing or checking goes to Paused and stops the clock; Esc in Paused resumes; Esc in Skipped or Passed does nothing.
  - A Run's time is first keystroke to pass, minus the total time spent in Paused. Words per minute uses the same time.
  - A check outcome that arrives while Paused still counts: a pass ends the Run as passed at the time the Pause began, and a failure is kept as feedback.
  - **Edits** are ignored while Paused, Skipped or Passed.
  - A **"start new Run" event** (from either menu button) replaces the Run with a fresh one on the chosen Puzzle. A Run dropped this way from Paused leaves no record.
  - The menu is open exactly when the phase is Paused, Skipped or Passed, so the Run decides it, not the page. (I3, I5)
- **Checks.** 400 ms after the last edit, the Solution is first parsed with acorn; code that doesn't parse fails at once with the parser's message. Code that parses goes to a fresh module Web Worker started from the runner script's own file address (no blob URL, no CSP), which is terminated when its reply arrives, after ~1 s (a timeout), or when a newer check replaces it. The worker protocol stays as it is: JSON text with the code, the function name and the tests in; `results` or `error` out. Keep one pre-spawned spare worker, so that a check doesn't wait for a worker to start (decided in [Research: sandboxing player JavaScript in the browser](issues/03-research-js-sandbox.md), not built yet). (I3, I4, I7)
- **Status line text** is a pure function of the Run and the stored history: "Start typing: the clock starts on your first keystroke." / "checking…" / "n/m tests pass", "doesn't parse yet", "crashed", "timed out" / "Paused. Esc to carry on." / "Skipped." / on a pass "Passed in 12.3 s, 42 wpm, 3 backspaces." plus one of "First time on this Puzzle.", "New best (was 14.0 s)." or "Best: 12.3 s.". The old "Press Esc for another Run" wording goes. (I3, I5)

**History and stats**

- **The Run record** stored for each passed Run: the Puzzle's file name, when it finished, duration in seconds (pauses removed), words per minute, Backspaces, the passing Solution, and the key-press sequence (each press's character and the milliseconds since the previous press). Records are appended as JSON to `localStorage["type-solution.runs"]`, as now. Records already stored, with no key presses and with the function name in `puzzle`, must still read. (I5)
- **When storage is full**, strip the key-press sequence from the oldest records until the new record fits; summaries are never dropped. If storage can't be used at all, play goes on and the Run isn't kept. (I5)
- **A new pure history module** in common code takes the stored records and answers:
  - **Personal best** for a Puzzle: its fastest passed record, worked out from the records each time, never stored separately.
  - **Most missed**: over the last 20 passed records that still have key presses, count Corrections per character (a character typed straight after a run of exactly one or two Backspaces). Characters typed fewer than 10 times in those Runs, and Space, Enter and Tab, are left out. Top five by count.
  - **Slowest**: over the same Runs, each character's median Hesitation (time since the previous press, leaving out each Run's first press and gaps over 1.5 s), with the same exclusions and minimum. Top five.
  - Case matters (`A` ≠ `a`). (I5)
- **Page reads and writes storage only through the editor shim**, which gains a call to read all stored records; Haskell decodes them. Nothing is ever sent over the network. (I5, I4)

**The page**

- **Layout, top to bottom**: Puzzle heading and prompt; editor; status line with the clock; menu (when open); failed-test feedback; "Most missed: …" and "Slowest: …" lines, always visible. The weak-key lines and the menu's position never move. (I1, I3)
- **The menu**: two buttons, New random Puzzle (a "skip next" icon) then Repeat Puzzle (a circular "repeat" icon), each with a tooltip, drawn as inline SVG (no icon library). It opens after a pass, a Pause or a skip, and the first button takes focus. While it's open the editor is read-only and doesn't capture Tab, so Tab / Shift+Tab move between the buttons and Enter or Space press one (browser default). Either button starts a Run with an empty, focused editor. (I3)
- **Puzzle choice**: random over the whole bank, both on page load and for New random Puzzle. Not weighted by weak keys. (I3)
- **The editor shim** gains: making the editor read-only and editable again; reporting every typed character itself (not just "a character") with a timestamp; reporting Tab presses; reading stored records. Highlighting, auto-indent, no auto-closing brackets and no autocompletion stay as they are; bracket-match highlighting stays (it's display only and types nothing). (I2, I8)
- **First paint**: the exported page paints its shell (title, styles, a "Loading…" line) before the wasm loads, as today. The Puzzle is chosen at random in the browser, so its text appears once the app starts, not in the exported page. (I8, I4)

**Hosting**

- **Build and deploy**: a GitHub Actions workflow on every push to `main` runs the Puzzle bank check and the common test suite, builds with `nix build` (WebAssembly), runs the backend once to export the first rendered page plus its asset folders, and force-pushes that folder as a single commit to the `gh-pages` branch. GitHub Pages serves it at `jafonsor.github.io/type-solution`. Asset links must work under the `/type-solution/` sub-path. No custom domain. No Content-Security-Policy. The Obelisk backend is used only in development and for the export; nothing runs in production. See [Grilling: hosting and deployment](issues/13-grilling-hosting.md) and [Grilling: which CSP rules ship](issues/15-grilling-csp-policy.md). (I4, I8)

## Testing Decisions

- **What a good test is.** It drives a module through its public interface with plain values (events in, state or text out) and checks behaviour the player or maintainer would notice: phases, times, counts, status text, stats. It never checks private fields, internal helpers or how the page is wired. Times are given explicitly (as the existing suite does with fixed timestamps), never read from the clock.
- **Seam 1: the Run state machine.** Extend the existing HUnit suite for the common package. New cases cover at least: Esc before the first keystroke skips; Esc during a Run pauses and paused time is left out of time and words per minute; Esc resumes; Esc does nothing after a pass or a skip; a check that passes during a Pause ends the Run at the Pause's start; edits are ignored while paused; starting a new Run from a Pause leaves no record; key presses are kept with their characters and timings; the record carries the Puzzle's file name and the key presses. Prior art: the existing Run tests in the common test suite (fold events over a new Run, compare the result).
- **Seam 2: the history module.** Same suite, built from hand-written record lists: Personal best is the fastest per Puzzle and ignores other Puzzles; the three status-line endings (first time / new best / best); Corrections count after one or two Backspaces but not three or more; Hesitation ignores gaps over 1.5 s and each Run's first press; only the last 20 Runs count; the 10-press minimum; Space, Enter and Tab never appear; `A` and `a` stay apart; records without key presses still give bests but don't count toward the lists; old-format records decode.
- **Seam 3: the Puzzle bank check.** It's itself the test of the bank and runs in CI before the build. It's trusted because it runs the browser's own runner script unchanged. A malformed file fails the build (when the splice parses TOML) or else the check itself.
- **Not unit-tested:** the Reflex wiring, the CodeMirror shim, worker spawning and the deploy. They're smoke-tested by playing the built app (pass a Puzzle, pause and resume, skip, repeat, an endless loop times out, Tab moves through the menu), as the fizzBuzz Run was.

## Out of Scope

- Accounts, global leaderboards and any server-side logic.
- Languages other than JavaScript.
- Runtime LLM generation of Puzzles; Puzzles written by players.
- Runs of several Puzzles; daily seeded sets.
- Share-as-text of a result.
- Choosing the next Puzzle by the player's weak keys; difficulty filters.
- A keyboard heatmap (the player's layout is unknown).
- A Content-Security-Policy or any block on a Solution's network access.
- GHC's JavaScript backend.
- A custom domain.
- Hot reload in development.

## Further Notes

- Bracket-match highlighting and undo/redo stay in the editor. Neither types anything for the player, so I2 holds; undo shortcuts aren't counted as typing.
- The current code has a known gap: after a pass the editor still accepts typing and Tab still indents. The read-only menu state fixes both.
- Personal bests belong to the file name, so editing a Puzzle file keeps its old bests.
- Safari is the least-tested browser so far (the sandbox research ran in Chrome only). Include it in the smoke test once the site is live.
