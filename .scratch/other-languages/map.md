# Wayfinder map: Other languages for Solutions, starting with PureScript

## Destination

A handoff-ready spec for letting the player type their Solution in a Language other than JavaScript, with PureScript first, on the existing app and static GitHub Pages deploy. It is shaped so that a second Language is cheap to add. Planning only: nothing is built on this map.

## Notes

- Domain: `CONTEXT.md` (new term **Language**; Solution, Reference Solution and Personal best updated). The MVP spec at `.scratch/type-solution/spec.md` ruled other Languages out (I7, "JavaScript only"); this effort redraws that.
- "Other languages" means Solution Languages the player types. The app's own implementation (Haskell, Obelisk, Reflex, WASM) is not changing.
- Player code runs in the browser; no server-side game logic; the deploy stays static (GitHub Pages).
- Tests stay Language-neutral: `args` and `expected` are JSON, shared by every Language.
- Standing preference: explain in plain language first, technical detail after (see the user's memory).

### Settled while charting (grilling, no ticket)

- **Dropdown, mid-Run.** The player switches Language with a dropdown, also during a Run. The choice is remembered in this browser and a new Puzzle opens in the last Language chosen.
- **Drafts.** Each Language keeps its own draft during a Run; switching shows that Language's draft. The Run stays one Run, and whichever Solution passes first ends it.
- **Run clock.** Switching does not reset the clock: the Run starts at the first keystroke as today, so a Run that switched is slower.
- **Credit.** The Run belongs to the Language that passed. A Personal best is per Puzzle and Language; a Run that switched is still eligible, with its whole-Run time. Words per minute and Backspace count are the passing Solution's; time is the whole Run.
- **Key presses.** Each key press counts toward the Language it was typed in; weak-key lists are per Language.
- **Bank.** A Language ships only when every Puzzle has a Reference Solution (and signature) in it. A Puzzle keeps one Language-neutral set of tests.

## Handoff spec

The destination is reached: [spec.md](spec.md).

## Decisions so far

<!-- one line per resolved ticket: gist, then link -->

- [Can a PureScript compiler run in the browser?](issues/01-research-purescript-in-browser.md): no maintained browser build exists (`purs` is native-only; Try PureScript compiles on a server); no timings measured, community projects not exhaustively ruled out. Opens the route question in [How does PureScript get checked with no browser compiler?](issues/06-grilling-checking-without-browser-compiler.md).
- [Editor support for PureScript](issues/03-research-editor-purescript.md): no ready-made CodeMirror 6 grammar; the bundled Haskell mode (~4 KB gzipped) plus a ~30-line wrapper is the cheap option; switching Language only swaps the editor's language extension.
- [How do PureScript Solutions meet JSON tests?](issues/02-research-purescript-json-tests.md): of 185 tests in 50 Puzzles, 31 Puzzles map to plain PureScript types; 12 have no single plain type (8 polymorphic lists, 4 mixed-value objects), 7 more need `Object a`/`Map`; calls are curried; some points unverified because nothing was compiled.
- [The Language dropdown and drafts](issues/05-prototype-language-dropdown.md): dropdown at the right edge of a thin bar under the editor (VS Code style), Alt+L cycles Language from the editor; an untouched Language opens empty; a hoverable `?` in the bar shows the Reference Solution as a tooltip.

- [How does PureScript get checked with no browser compiler?](issues/06-grilling-checking-without-browser-compiler.md): static deploy is a hard rule; PureScript stays first, via an attempted `purs` port to WebAssembly or JavaScript; any Language's compiler is a separate, fingerprinted, lazy-loaded, locally cached bundle fetched on first pick.

- [A Puzzle file with several Languages](issues/04-grilling-puzzle-file-per-language.md): one file, a table per Language for `signature` and `reference`, shared prompt and tests; PureScript's signature is two typed lines; limits become 4-30 lines and 100-900 characters, imports excluded; autocomplete inserts imports and is not counted as typed; all 50 Puzzles get a PureScript Solution (`queryString`, `withDefaults` as advanced types, `getPath` with `Json`). Spawns [Auto-import in the editor](issues/08-prototype-auto-import.md).

- [Can purs be built for the browser?](issues/07-research-purs-browser-port.md): feasible with caveats; toolchain and Template Haskell work, blockers are at the edges (`basement`, `network`, `cborg` on 32-bit); no build finished, so size and check time unmeasured; the shape is a small library-only wasm core, externs as static files. Opens [What gate decides the PureScript port?](issues/09-grilling-port-go-no-go.md).
- [What gate decides the PureScript port?](issues/09-grilling-port-go-no-go.md): the port is the plan of record with no numeric gate (build, measure, then set limits); GHC 9.8 wasm `native` flavour (no `gmp`); fallback decided after measuring. Spawns [Build purs as a browser WebAssembly module and measure it](issues/10-task-build-purs-wasm.md).

- [Build purs as a browser WebAssembly module and measure it](issues/10-task-build-purs-wasm.md): works; `purescript` v0.15.16 built on GHC 9.14 wasm (9.8 and `native` are not available on macOS arm64; `gmp` is linked); 2.3 MB brotli, Prelude externs 47 KB brotli, one-module re-check 0.3 to 0.46 s under Node, cold Prelude build 3.4 s; measured in Node only. Spawns [Run the PureScript wasm module in a browser web worker](issues/11-task-purs-wasm-in-browser-worker.md), [When does a PureScript check run, and how are its errors shown?](issues/12-grilling-check-latency-and-syntax-errors.md) and [How is the PureScript compiler bundle built, pinned and shipped?](issues/13-grilling-compiler-bundle-build-and-deploy.md).

- [Build a `native` (no gmp) wasm GHC 9.14 from source and rebuild purs-core with it](issues/14-task-build-native-wasm-ghc.md): works; 34 min to build GHC on this Mac, `purs-core` unchanged and byte-identical output, 2.28 MB brotli, same speed, no `gmp` in the binary; the app's own wasm does contain `gmp` today. Feeds [How is the PureScript compiler bundle built, pinned and shipped?](issues/13-grilling-compiler-bundle-build-and-deploy.md).

- [Run the PureScript wasm module in a browser web worker](issues/11-task-purs-wasm-in-browser-worker.md): works in Chrome; same speeds as Node (unchanged check about 0.2 s, edited `Main` 0.3 to 0.4 s, cold Prelude 3.4 s, 20 MB memory), type and syntax errors come back as readable text, and the generated JavaScript ran after blob-URL linking; shim needs a file modified time that moves with edits; `arrays` externs, real network, other browsers and the real sandbox/CSP unmeasured. Unblocks [When does a PureScript check run, and how are its errors shown?](issues/12-grilling-check-latency-and-syntax-errors.md).

- [Auto-import in the editor](issues/08-prototype-auto-import.md): variant D, a list popup after 2 letters showing each name's module; Tab or Enter adds only the import line (merged or new, at the top) and the player still types the whole name; already-imported and Prelude names are not offered; Tab still indents with no popup; only the import line counts as inserted. Real CodeMirror accept hook not yet tested.

- [How is the PureScript compiler bundle built, pinned and shipped?](issues/13-grilling-compiler-bundle-build-and-deploy.md): a Nix package in the app's own `nix build` (patch file in this repo; amended: the `gmp`-free wasm GHC, no licence note); puzzle-check compiles every PureScript Reference Solution with it; a committed library list with one pinned package set drives the externs; hashed file names plus Cache Storage; downloaded on first PureScript pick.
- [When does a PureScript check run, and how are its errors shown?](issues/12-grilling-check-latency-and-syntax-errors.md): keep the 400 ms pause with one long-lived compiler worker and a ~5 s compile timeout; library results shipped, optional warm-up; first error in the status line plus optional underlines (menu toggle, saved in local storage, both Languages); "Loading PureScript compiler…" line; Run time still ends when the result arrives.
- [Does peeking at the Reference Solution cost anything?](issues/15-grilling-peeking-at-the-solution.md): no cost, but a label: hover open for about 1 s in any Language marks the whole Run "peeked"; still eligible for the Personal best, shown wherever the time is, faster time wins; no new bank rules beyond a light write-to-be-read line.
- [How are options, Languages and existing saved data laid out in the browser?](issues/16-grilling-saved-data-and-options.md): one runs list with a new `language` field (missing = JavaScript, old records untouched); bests and weak-key lists derived per Language, never stored; `type-solution.language` and `type-solution.options` keys; drafts in memory only; underline toggle is a checkbox in the menu.
- [Does a CodeMirror completion edit the name and the top import block in one transaction?](issues/17-task-auto-import-in-codemirror.md): yes; an `apply` function that dispatches only the import edit (new or merged) is one undo step and leaves the typed word and cursor alone, Tab still indents with no popup; the build must set `activateOnTypingDelay: 0` and `interactionDelay: 0` (else early Tab indents), skip `validFor`, and call `closeCompletion` after accepting; one-line imports only tested, other browsers and the key recorder not.
- [How is the Puzzle bank authored and checked for a non-JavaScript Language?](issues/18-grilling-bank-authoring-for-a-language.md): a `languages/<name>/` folder per Language (JavaScript too) with package list, config, name-preference list and authoring notes; one `write-puzzle` skill with shared rules that reads them; per-Language symbol lists and reports (5 each, never fails); one-line imports only; name table generated from the package list's exports; the 50 PureScript Reference Solutions are the first build step, no verification on this map.
- [What must the PureScript spec keep generic so a second Language is cheap?](issues/19-grilling-keeping-the-second-language-cheap.md): four named seams (Checker incl. calling convention, Editor mode, optional Import rules, `languages/<name>/` folder); JavaScript described as the first Language behind them; limits and timeout per Language, 400 ms pause and underline toggle global; an 8-item second-Language checklist, and a Language needing a server is out of scope.
- [Which decisions on this map deserve ADRs?](issues/20-grilling-adrs-for-the-redrawn-scope.md): two ADRs for the handoff spec (0002 more than one Language, superseding I7; 0003 static deploy with a lazy-loaded compiler bundle); none for Personal best per Language or the licence note. The `gmp` point is closed: the `gmp`-free build was chosen.

## Not yet specified

- **Fallback if a later limit fails.** The browser run passed ([ticket 11](issues/11-task-purs-wasm-in-browser-worker.md)); this returns only if size or time limits set later fail: a different first Language that already runs in a browser, a reduced PureScript-like checker, or dropping the real type check.

## Out of scope

- Rewriting the app's own implementation in another language.
- Server-side compilation or checking.
- Accounts or sharing of Personal bests across browsers.
