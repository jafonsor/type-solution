# Spec: Other Languages for Solutions, PureScript first

Status: ready-for-agent

Map: [map.md](map.md). Every decision below comes from the map's resolved tickets, linked where they hold more detail. Terms (Language, Solution, Reference Solution, Personal best, Peek) are defined in `CONTEXT.md`. This spec changes the MVP spec ([../type-solution/spec.md](../type-solution/spec.md)); where they disagree, this one wins, and ADR 0002 (below) records that.

## Design Contract

Rules every build decision must keep. Breaking one means stopping to ask.

- **L1 — No server.** The deploy stays static (GitHub Pages). Typed code never leaves the browser, for every Language. A Language that needs a server is out of scope. ([ticket 06](issues/06-grilling-checking-without-browser-compiler.md))
- **L2 — Tests are Language-neutral.** A Puzzle has one set of tests, `args` and `expected` as JSON, shared by every Language.
- **L3 — One Run, many Languages.** The player may switch Language mid-Run. Switching does not reset the clock; whichever Solution passes first ends the Run.
- **L4 — A Language ships only when complete.** Every Puzzle in the bank has a Reference Solution and signature in it. A Puzzle written later must arrive with one in every shipped Language.
- **L5 — The seams stay narrow.** Adding a Language touches only its four seams (below) and its `languages/<name>/` folder. Not the dropdown, saved data, Run, Personal best or Puzzle file format.
- **L6 — The MVP contract otherwise holds.** I1 to I6 and I8 of the MVP spec stand. I7 ("JavaScript only") is superseded by this spec. I2's "no suggestions or autocomplete" gets one exception: the import popup (see Editor).

## Player behaviour (Language-neutral)

All of this is the same for every Language.

**Choosing a Language**
- A dropdown at the right edge of a thin bar directly under the editor (like VS Code's status bar picker). **Alt+L** cycles Languages from inside the editor. Tabs above the editor and a dropdown by the signature were rejected. ([ticket 05](issues/05-prototype-language-dropdown.md), prototype in `prototype-language-dropdown/`)
- The choice is remembered in this browser; a new Puzzle opens in the last Language chosen. First visit, or an unknown saved value: JavaScript.
- The bar also holds a hoverable `?` that shows the Reference Solution as a tooltip ([ADR 0001](../../docs/adr/0001-reference-solution-shown-on-hover.md)).

**Drafts.** Each Language keeps its own draft during a Run; switching shows that Language's draft. An untouched Language opens empty (no pre-fill, not even the signature as code). Drafts live in memory only; a reload starts a fresh Run.

**The Run and its credit** ([map Notes](map.md))
- The clock starts at the first keystroke (in any Language), as today. A Run that switched is slower by that much; there is no reset.
- The Run belongs to the Language that passed. Words per minute and Backspace count are the passing Solution's; the time is the whole Run.
- **Personal best** is per Puzzle and Language. A Run that switched is still eligible, with its whole-Run time.
- **Key presses** count toward the Language they were typed in; Most missed and Slowest lists are per Language.
- The Run's time ends when the passing check's result arrives, so waiting for a compiler counts. Preloading keeps that wait small.

**Peeking** ([ticket 15](issues/15-grilling-peeking-at-the-solution.md)). Tooltip open for about 1 s or more, in any Language, marks the whole Run "peeked". It stays eligible for the Personal best; the plain word "peeked" shows wherever the time is shown (end-of-Run result, beside the best on the status line, in lists). A faster Run replaces the best, peeked or not; the mark follows the Run that holds the best; a slower unpeeked Run does not replace a faster peeked best. The Run record carries a `peeked` flag.

**Checks and errors** ([ticket 12](issues/12-grilling-check-latency-and-syntax-errors.md))
- Check 400 ms after the last edit, for every Language. A newer edit makes the older result ignored.
- The status line shows the first error only, as one cleaned line with line and column ("doesn't parse yet" for syntax errors, "doesn't type-check yet" for type errors). Hovering it shows all errors in full.
- Optional underlines for both Languages, a checkbox "Show error underlines" in the menu (after the two buttons, reachable by Tab, flipped with Space), on by default. They appear when a check finishes and disappear on the next edit. The status-line message stays either way.
- While a Language's compiler downloads: the status line reads "Loading <Language> compiler…" (with a percentage if available), the player can keep typing, and the first check runs when loading finishes. A failed download says so with a retry; switching to JavaScript always works.

**Saved data** ([ticket 16](issues/16-grilling-saved-data-and-options.md))
- Runs stay in the single list `localStorage["type-solution.runs"]`. Each new record has a `language` field; a missing one reads as JavaScript; old records are never rewritten. The storage-full rule (strip key presses from the oldest records first, never drop summaries) is unchanged and covers all Languages.
- Personal best, Most missed and Slowest are derived from the runs each time and never stored, filtered by the current Language. The "last 20 passed records" window counts only that Language's records.
- Own key `type-solution.language` (read once on page load). Own key `type-solution.options`: a JSON object, first field `underlines` (default on); missing key or field takes the default; unknown fields are preserved on save.

## The four seams

What a Language must supply ([ticket 19](issues/19-grilling-keeping-the-second-language-cheap.md)). Everything not listed here is shared app behaviour.

1. **Checker.** Typed code plus a Puzzle's tests in; pass, fail or a readable error (message, line, column, range) out. It includes the **calling convention**: how a test's JSON `args` and `expected` become a call and a comparison. That rule is per Language and documented in its folder. Per-Language settings: compile timeout and length limits (below). Global: the 400 ms pause.
2. **Editor mode.** Syntax colouring and indent rules; switching Language swaps only the editor's language extension.
3. **Import rules** (optional). How the Language adds an import line. A Language with none shows no popup and loses nothing else. The "one-line imports only" bank rule applies only to a Language that has imports.
4. **Bank folder** `languages/<name>/` (see Bank).

**JavaScript is the first Language, in the same terms.** The build refactors it behind these seams while adding PureScript, so there is never a second code path. Its check keeps the current behaviour: acorn parse, then a fresh worker per check, a ~1 s timeout, a spare worker.

## Puzzle file

([ticket 04](issues/04-grilling-puzzle-file-per-language.md))

- `function`, `prompt` and `[[tests]]` stay at the top level, shared. Each Language has a table, `[javascript]`, `[purescript]`, holding `signature` and `reference`. A missing table means the Puzzle is not in that Language yet (and that Language cannot ship, L4). Existing files migrate by wrapping `signature` and `reference` in `[javascript]`.
- `Puzzle.hs` accepts the known Language tables and rejects unknown names.
- **Prompt:** one, Language-neutral. Examples are plain input → output pairs (`"internationalization" → "i18n"`); puzzle-check lints out Language-specific call syntax.
- **Limits, all Languages:** Reference Solution 4 to 30 non-blank lines and 100 to 900 characters, imports excluded. Existing JavaScript Puzzles need no change. (Per-Language limits are allowed in each Language's config; these are the defaults.)
- **PureScript signature:** two lines, shown above the editor and typed by the player (they count toward the limits):

      chunk :: forall a. Array a -> Int -> Array (Array a)
      chunk items size = ...

  Parameter names match the order the tests pass.

## PureScript

### Checker: a browser build of `purs`

([research 01](research/01-purescript-in-browser.md), [07](research/07-purs-browser-port.md), tickets [06](issues/06-grilling-checking-without-browser-compiler.md), [09](issues/09-grilling-port-go-no-go.md), [10](issues/10-task-build-purs-wasm.md), [11](issues/11-task-purs-wasm-in-browser-worker.md), [13](issues/13-grilling-compiler-bundle-build-and-deploy.md), [14](issues/14-task-build-native-wasm-ghc.md))

No maintained browser build of the PureScript compiler exists; the plan of record is our own port to WebAssembly, with no numeric gate (build, measure, then set limits). It has been built and run:
- Patched upstream `purescript` v0.15.16 on GHC 9.14's wasm backend; **2.3 MB brotli**, Prelude externs about 47 KB brotli.
- Browser (Chrome) worker run: unchanged check about 0.2 s, edited `Main` 0.3 to 0.4 s, cold Prelude build 3.4 s, about 20 MB memory. Type and syntax errors come back as readable text; the generated JavaScript runs after blob-URL linking. Needs a file modified-time that moves with edits.
- **Not yet measured:** `arrays` externs, real network, other browsers, the real deployed sandbox. Measure these early in the build.

**Build and shipping**
- **A Nix package in the app's own `nix build`** produces the bundle (`purs-core.wasm` plus externs); reused from the cache when inputs are unchanged. Same command locally and in CI; the existing `deploy.yml` (with its Nix cache) is the only pipeline. If a cold CI build is too slow, a separate workflow is the fallback.
- **Patches:** a patch file in this repo applied to pinned upstream (no fork). Start from `research/10-purs-wasm/purescript.patch` and its entry point.
- **Toolchain:** a `gmp`-free wasm GHC 9.14 (flavour `perf+native_bignum`, no `--with-intree-gmp`), built from the `haskell-wasm/ghc` `ghc-9.14` branch, instead of the repo's prebuilt `gmp` one. This was proven in [ticket 14](issues/14-task-build-native-wasm-ghc.md): 34 min to build on a 10-core Mac, `purs-core` unchanged, byte-identical output, 2.28 MB brotli, same speed, no `gmp` in the binary. Recipe and scripts: `research/10-purs-wasm/` (`ghc-native-build.sh`, `ghc-native-install.md`, `ghc-native-install.sh`, `purs-core-build-with-native-ghc.sh`). No `gmp` licence note is needed for the compiler bundle (this reverses [ticket 13](issues/13-grilling-compiler-bundle-build-and-deploy.md)'s toolchain choice, per the owner). **Not yet done:** packaging this GHC build in Nix, building it on Linux CI, and running the `native`-built compiler in a browser. These are the new risks; CI should cache the GHC build, since a cold one is about 34 min. The app's own `frontend.wasm` still links `gmp`; that is unchanged by this spec (a `native` frontend build was shown to work only on the Obelisk-free prototype).
- **Libraries:** a committed list in `languages/purescript/` is the source of truth, naming one pinned package-set release. The Nix package builds externs and compiled library JavaScript for exactly that list. puzzle-check fails if a Reference Solution imports a library not on the list.
- **Serving:** the bundle is separate from the main one, with a content hash in every file name (GitHub Pages sets no cache headers), kept in Cache Storage; old versions deleted when a new one is stored. A hashed manifest maps each library to its externs; a library's externs are fetched only when a Solution imports it. No CSP change (the page has none).
- **Download timing:** on the first PureScript pick, or at page load if PureScript is the remembered Language. JavaScript-only players pay nothing.
- **Reference Solution check:** puzzle-check compiles every PureScript Reference Solution with this compiler and fails on any error. This also guards against the 9.14 version drift.

**Check behaviour**
- One long-lived compiler worker, kept between checks; each check gets a fresh compiler instance in it with a persistent in-memory file tree. Compile timeout about 5 s (a safety net); only on timeout is the worker killed, and the new one rebuilds its tree from the saved downloads. The ~1 s timeout applies only to running the generated JavaScript against the tests, in a fresh sandbox as today. No spare worker.
- Library results are shipped, not persisted per check. No OPFS (an option if the first check feels slow). An optional low-priority warm-up compile of the Puzzle's Reference Solution runs after load and when a new Puzzle opens; a real check goes first.
- PureScript syntax errors report the line after the break, so an underline goes at the end of the last non-blank line before the reported position.

### Calling convention

([research 02](research/02-purescript-json-tests.md), ticket 04)

Calls are curried. Of 185 tests in 50 Puzzles, 31 Puzzles map to plain PureScript types; the rest:
- **Polymorphic lists** (`chunk`, `everyOther`, `positions`, `rotate`, `unique`, `grid`, `flatten`, `zip`): `forall a.`; `flatten` is one level; `unique` and `positions` need `Eq a =>`; `zip` returns `Array (Tuple a b)`, converted to JSON pairs by the harness.
- **One-value-type objects** (`countWords`, `groupByLength`, `invert`, `mergeCounts`, `toggleFlags`, `topScorer`, `totalCost`, `pick`): `Object a`.
- **Advanced types, kept on purpose** (the owner wants Puzzles that practise advanced typing): `queryString` (record of any shape, walked with `RowToList` and a type class), `withDefaults` (`Record.merge` with a `Union`/`Nub` type). Tests untouched.
- **`getPath`**: `Json -> String -> Json`, a deliberate interop Puzzle. Tests untouched.
- So every Puzzle gets a PureScript Solution; L4 holds with no exceptions.
- **Unverified** (no compiler ran on these): the `queryString` and `withDefaults` sketches, the `Type.Proxy` module name, dictionary passing for `Eq a =>`, the runtime shape of `Tuple`. They are settled by the first build step below.

### Editor mode

([research 03](research/03-editor-purescript.md)) No CodeMirror 6 grammar for PureScript exists. Use the bundled Haskell mode (~4 KB gzipped) with a ~30-line wrapper.

### Import rules and the import popup

([ticket 08](issues/08-prototype-auto-import.md), prototype in `prototype-auto-import/`; [ticket 17](issues/17-task-auto-import-in-codemirror.md), prototype in `prototype-auto-import-codemirror/`)

- **Popup:** after 2 letters, on names in a name-to-module table, up to 6 matches, each shown with its module. Never on an `import` line. It stays open while typing. Esc closes it; clicking elsewhere closes it. Names already imported and Prelude names are not offered.
- **Accepting:** Tab or Enter adds **only the import line**; the typed letters are untouched and the player still types the whole name. Up/down move the highlight. While the popup is open Enter accepts instead of making a newline. With no popup, Tab still indents (two spaces). Dropping Enter-accepts is a one-line change if it annoys.
- **Import edit:** if `import M (...)` exists, merge the name into it (`take` then `drop` gives `import Data.Array (take, drop)`); otherwise add a line after the last import, or at the top with a blank line below when there are none. The cursor keeps its place relative to the typed text.
- **Counting:** the import line is inserted text, not typed: not a key press in the Run record, not in words per minute, excluded from the line and character limits. Everything else the player types counts, names included.
- **CodeMirror build requirements** (verified in Chrome with `@codemirror/autocomplete` 6.20.4):
  - Completion `apply` is a function that dispatches only the import edit (one transaction, one undo step, cursor mapped automatically), tagged `userEvent: "input.complete"` so the key recorder can tell it from typing.
  - A highest-precedence Tab binding runs `acceptCompletion` and returns `false` when no popup is open, so `indentWithTab` handles Tab.
  - Set `activateOnTypingDelay: 0` and `interactionDelay: 0` (defaults made an early Tab indent instead of accepting).
  - Do not use `validFor` (it keeps showing an already-imported name).
  - Call `closeCompletion(view)` at the end of `apply`.
- **Not yet tested:** other browsers, the app's key-press recorder, touch keyboards. Test these when building.
- **Imports are one line only** (see Bank), because the merge handles only `import M (a, b)`.

## Bank

([ticket 18](issues/18-grilling-bank-authoring-for-a-language.md))

- **`languages/<name>/` per Language, JavaScript included.** JavaScript's length limits and symbol list move out of the `write-puzzle` skill and `tools/puzzle-check` into its folder. A PureScript folder holds: the pinned package list (read by the app build and puzzle-check), a reference to the compiler patch, a config (length limits, symbol list, compile timeout, calling-convention notes), the preference list for names two modules export (for example `filter` in `Data.Array` and `Data.List`), and `authoring.md` (style advice, traps). A second Language adds a folder; the skill and the check do not change.
- **puzzle-check** reads those folders: runs each Language's Reference Solutions in that Language's runner, enforces limits, and prints a symbol coverage table **per Language** (goal: every symbol in at least 5 of that Language's Reference Solutions; never fails). The exact PureScript symbol list is tuned once real Reference Solutions exist. It also lints prompts for Language-specific call syntax and verifies every symbol in a Reference Solution is in the name table.
- **`write-puzzle`:** one skill, shared core (file format, identity, prompt, JSON values, easy, 3 to 6 tests) plus an instruction to read each shipped Language's folder. Language-specific rules now in the skill move out: "no imports", the `Object.keys` key-order trap, length numbers, symbols and style advice, and the survey/check commands naming the per-Language report. Add one light line: write the Reference Solution the way you would want to read it when stuck (peeking).
- **Imports:** every PureScript Reference Solution uses only one-line imports (`import M (a, b)`; no `qualified`, `hiding`, `as`, wrapped lines), enforced by puzzle-check. A Puzzle needing more is rewritten, not exempted.
- **Name-to-module table:** generated at build time from the exports of the pinned package list's library files (not only from the bank), with the preference list for clashes.

## Adding a second Language: the checklist

Do not pick it here. A Language is "cheap" if it needs only:
1. A Checker that runs in the browser in a worker, with no server.
2. A lazy-loadable bundle with a pinned build recipe.
3. An Editor mode.
4. Import rules, or an explicit "none".
5. A `languages/<name>/` folder.
6. A Reference Solution and signature for every Puzzle.
7. A calling-convention note.
8. puzzle-check compiling or running every Reference Solution.

## ADRs to write

Not written on the map ([ticket 20](issues/20-grilling-adrs-for-the-redrawn-scope.md)). Write both at the start of the build; format in `docs/adr/` (see ADR 0001).
- **ADR 0002, "Solutions can be typed in more than one Language".** Supersedes the MVP spec's I7. Records: Languages as a concept, the four seams in one short paragraph, the `language` field on runs (missing = JavaScript), the rejected alternatives (stay JavaScript-only; check on a server).
- **ADR 0003, "A static deploy with a lazy-loaded compiler bundle".** Records: the static-deploy rule, the separate fingerprinted lazy-loaded cached bundle, the port as plan of record with no numeric gate and the fallback left open, the build in the app's own `nix build`; rejected: a server-side checker. Consequences: the compiler bundle is built with a custom `gmp`-free GHC the repo must build and cache (about 34 min cold); the app's own wasm is unchanged.

No ADR for Personal best per Puzzle and Language (a `CONTEXT.md` rule; bests are derived and cheap to change).

## Build order

1. **Write and compile all 50 PureScript Reference Solutions** with the wasm compiler, puzzle-check as judge. Riskiest first: `getPath` (`Json`), the 8 polymorphic-list and 4 mixed-value-object Puzzles, `queryString`, `withDefaults`. If a Puzzle cannot be typed in PureScript, either change that Puzzle's tests for every Language or hold PureScript back until fixed. Tune the PureScript symbol list from these.
2. Move JavaScript behind the four seams; add the `languages/` folders and update `write-puzzle` and puzzle-check; migrate Puzzle files to `[javascript]` tables.
3. Nix package for the `gmp`-free GHC and the compiler bundle: write the derivation with every input pinned (it builds in a closed box with no network); build it first in Docker as `linux/amd64` (Docker Desktop with Rosetta is already set up on the owner's Mac; if GHC fails under Rosetta, skip to the next step), with CPU, memory and disk capped to the GitHub runner's; then confirm it in a real GitHub Actions run, including that the roughly 34 min result is cached between runs. Then library list and externs, hashed files, Cache Storage; measure the items marked "not yet measured".
4. Language dropdown bar, Alt+L, per-Language drafts, saved data (`language` field, keys), Personal best and weak-key lists per Language, `peeked` flag.
5. PureScript Checker worker, status-line and underline errors, loading line.
6. Editor mode and the import popup; test the untested items.
7. ADRs 0002 and 0003; update the MVP spec's I7.

## Out of scope

- Rewriting the app's own implementation in another language.
- Server-side compilation or checking.
- Accounts or sharing of Personal bests across browsers.

## Fog still on the map

**Fallback if a later limit fails** (size or time limits set after measuring): a different first Language that already runs in a browser, a reduced PureScript-like checker, or dropping the real type check. Decided only if the build's measurements fail; not specified here.
