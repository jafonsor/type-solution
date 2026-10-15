# Map: Type Solution MVP

Label: wayfinder:map

## Destination

A handoff-ready MVP spec for Type Solution: a typing-practice web game where the player sees a Puzzle and races to type any JavaScript Solution that passes its hidden tests, checked live in the browser.

## Notes

- Domain: see `CONTEXT.md` (Puzzle, Run, Solution).
- The real goal is practising new keyboard layouts; code Puzzles are the fun wrapper. Judge each ticket against "does this make layout practice better?"
- Grilling tickets: call the Skill tool for "grilling" and "domain-modeling".
- Settled while charting:
  - Player sees only the Puzzle and types any working Solution (not a drill of shown code).
  - Audience: developers practising; public web toy, anonymous play.
  - One Puzzle per Run. Clock runs first keystroke → tests pass; Esc gives up (not recorded).
  - Tests re-run on typing pause; auto-advance on pass. No submit key.
  - Headline score is raw time; also show words per minute and backspace count (see 06). Personal bests in the browser.
  - Next Puzzle: random, one-key restart/next. No difficulty filter.
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

## Not yet specified

- Choosing the next Puzzle with the player's weak keys in mind (deferred by issue 10); revisit once the launch bank's size and coverage are settled.
- Sandbox gaps from issue 03, not built yet: the warm spare worker (each check starts a fresh one) and the CSP header that blocks the worker's network access.

## Out of scope

- Accounts and global leaderboards (need server-side verification).
- Languages other than JavaScript.
- Runtime LLM generation of Puzzles; player-authored Puzzles.
- Multi-Puzzle Runs and daily seeded sets.
