# Map: Type Solution MVP

Label: wayfinder:map

## Destination

A handoff-ready MVP spec for Type Solution: a typing-practice web game where the player sees a Puzzle and races to type any JavaScript Solution that passes its hidden tests, checked live in the browser.

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

## Notes

- Domain: see `CONTEXT.md` (Puzzle, Run, Solution).
- The real goal is practising new keyboard layouts; code Puzzles are the fun wrapper. Judge each ticket against "does this make layout practice better?"
- Grilling tickets: call the Skill tool for "grilling" and "domain-modeling".
- Settled while charting:
  - Player sees only the Puzzle and types any working Solution (not a drill of shown code).
  - Audience: developers practising; public web toy, anonymous play.
  - One Puzzle per Run. Clock runs first keystroke → tests pass, minus Pauses; Esc pauses (see 11).
  - Tests re-run on typing pause; the Run ends by itself on pass (no submit key), then waits on a menu (see 11).
  - Headline score is raw time; also show words per minute and backspace count (see 06). Personal bests in the browser (see 11).
  - Next Puzzle: random, chosen from the menu (New random Puzzle / Repeat Puzzle). No difficulty filter.
  - Editor: syntax highlighting + auto-indent; no auto-closing brackets; no suggestions (see 04).
  - JavaScript only. Player code runs in-browser (Web Worker + timeout); no server-side game logic.
  - Puzzles are hand-authored config files in the repo, written by coding agents; the app never calls an LLM.

## Decisions so far

- [Research: reflex-dom vs PureScript for an FRP frontend](issues/01-research-frontend-frp.md): reflex-dom viable via Obelisk 2/wasm but preview-grade and multi-MB; PureScript lean with easy CM6 FFI, but its FRP lib (Deku) is thinly maintained, Halogen healthy but not FRP.
- [Research: sandboxing player JavaScript in the browser](issues/03-research-js-sandbox.md): fresh module Web Worker per check (one warm spare), terminate() on ~1 s timeout or supersede; CSP blocks network; acorn for syntax errors.
- [Grilling: choose the frontend stack](issues/02-grilling-frontend-stack.md): reflex-dom on Obelisk v2 with its Snap backend only serving the app; CM6 behind a thin esbuild JS shim; plain-JS test-runner worker; `ob-run` dev loop. Compile target split out.
- [Research: Obelisk v2 WebAssembly frontend size](issues/07-research-wasm-size.md): skeleton app from Obelisk CI: wasm ≈956 KB brotli (5.5 MB raw) vs JS/Closure ≈497 KB brotli (4.0 MB raw); wasm faster to start locally (~45 vs ~130 ms) but ~2× slower on slow links; +CM6 ≈144 KB br. (Its "no local build" blocker was later solved by 09.)
- [Task: get Obelisk v2 building on this Mac](issues/09-task-obelisk-on-mac.md): works without a VM on the jafonsor/obelisk `macos-v2` fork; the app is built on it. Dev: direnv loads the shell on `cd` (HLS included), then `ob-run`; prod: `nix build` (the flake's default package, the wasm server).
- [Grilling: Obelisk compile target](issues/08-grilling-compile-target.md): WebAssembly for dev and prod; JS backend out of scope (accepting ~2× download on slow links).
- [Prototype: editor feel and auto-advance](issues/04-prototype-editor-feel.md): 400 ms pause, failed tests listed below the editor, no suggestions; built as the real fizzBuzz Run.
- [Grilling: Puzzle file format](issues/05-grilling-puzzle-format.md): one TOML file per Puzzle in `puzzles/`, read in at compile time; file name is the Puzzle's identity; adds a reference Solution checked against the tests; no `null` values.
- [Grilling: what a Run records and shows](issues/06-grilling-run-record.md): time, words per minute (Space/Enter straight after a character), Backspace presses and the passing Solution, appended to browser storage; personal bests and sharing not decided.
- [Grilling: per-key mistakes and weak-key practice](issues/10-grilling-per-key-mistakes.md): each Run also stores its key presses with timings; "Most missed" (character typed after 1–2 Backspaces) and "Slowest" (median delay, gaps over 1.5 s ignored) lists below the editor, over the last 20 Runs; no Puzzle weighting yet.

- [Grilling: personal bests, the results screen and sharing](issues/11-grilling-bests-results-sharing.md): best = fastest time per Puzzle, shown on the status line after a pass; Esc pauses; a menu of two icon buttons (New random Puzzle, Repeat Puzzle) reached with Tab after a pass, a Pause, or a skip.
- [Grilling: Puzzle authoring guide and the launch bank](issues/12-grilling-authoring-guide-launch-bank.md): a repo skill for agents; easy pure-function Puzzles, references 4–12 lines / 100–350 chars, prompt with one example and every tested edge case, 3–6 tests; bank-wide symbol coverage report; ~50 Puzzles across strings/arrays/numbers/objects, added in human-skimmed batches of ~10.
- [Grilling: hosting and deployment](issues/13-grilling-hosting.md): no server; GitHub Actions builds each push to `main`, exports the static files and force-pushes them to a `gh-pages` branch served by GitHub Pages at `jafonsor.github.io/type-solution`; CSP via meta tag + blob worker (later dropped: see which CSP rules ship).
- [Research: do blob workers inherit a meta-tag CSP?](issues/14-research-blob-worker-csp.md): yes in Chrome (tested) and Firefox (WPT); Safari yes per WebKit source but untested. The page can't use `connect-src 'none'` because it fetches its own wasm; three candidate policies; the test worker must change from a file URL to a blob.
- [Grilling: which CSP rules ship](issues/15-grilling-csp-policy.md): none; no meta tag, the worker keeps its file URL and its ~1 s timeout. Supersedes the CSP part of hosting.

## Not yet specified

Nothing. (The warm spare worker from [Research: sandboxing player JavaScript in the browser](issues/03-research-js-sandbox.md) is decided, just not built.)

## Out of scope

- Accounts and global leaderboards (need server-side verification).
- Languages other than JavaScript.
- Runtime LLM generation of Puzzles; player-authored Puzzles.
- Multi-Puzzle Runs and daily seeded sets.
- Share-as-text of a Run's result: anonymous solo practice, so a shared time compares to nothing ([Grilling: personal bests, the results screen and sharing](issues/11-grilling-bests-results-sharing.md)).
- Choosing the next Puzzle with the player's weak keys in mind: random choice ships; with ~50 Puzzles and 20-Run stats the data is too thin to weight by, so it's a later effort ([Grilling: Puzzle authoring guide and the launch bank](issues/12-grilling-authoring-guide-launch-bank.md)).
- Blocking a Solution's network access (CSP): the code runs only in the player's own browser, so it may do whatever its author wrote ([Grilling: which CSP rules ship](issues/15-grilling-csp-policy.md)).
