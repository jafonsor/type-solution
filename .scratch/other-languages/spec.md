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
  - **As built (ticket 29):** the bar's dropdown is built from the Language registry (`static/editor/src/languages.mjs`), so a Language added there appears with no other change. Each Language's draft is a whole editor state (text, cursor, undo history) kept in memory; a new Run (either menu button) drops every draft and keeps the Language. The `type-solution.language` key is read once at page load and written on every pick. The `?` is not built yet.
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

- `function`, `prompt` and `[[tests]]` stay at the top level, shared. Each Language has a table, `[javascript]`, `[purescript]`, holding `signature` and `reference`. A missing table is an error: every Puzzle has a Solution in every Language (L4), and puzzle-check fails a file without one. Existing files migrate by wrapping `signature` and `reference` in `[javascript]`.
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
- **Measured in ticket 28** (Chrome 157 and Firefox 158.0.1 on the owner's Apple-silicon Mac, a local static server, machine load average 25 to 40 so every time is pessimistic; harness `tools/purs-bundle/browser/`):
  - **`arrays`:** its pack is 69,804 bytes gzip (501 KB raw: sources, externs, compiled JavaScript); the Prelude pack 115,108 bytes gzip (1.0 MB raw). But `arrays` requires 28 other libraries, so a Solution with `import Data.Array` loads 29 libraries: 566,705 bytes gzip, a 6.1 MB file tree, 148 modules. The compiler still parses every source file it is given on each check, so a check of `import Data.Array` costs more than Prelude only. Chrome, first / unchanged / edited check: Prelude only 328 / 232 / 176 ms; `import Data.Array` 1119 / 598 / 556 ms with only the 91 reachable modules given to the compiler (Firefox: 141 / 120 / 120 and 470 / 365 / 377 ms). Giving the compiler all 148 cut the speed by about 40% (Node, same load: 2.7 s against 1.6 s). Memory 32 to 43 MB. The 400 ms check target therefore holds for Prelude-only Solutions but not for `import Data.Array` in Chrome on this machine; re-measure on a quiet machine before setting limits (ticket 31).
  - **Bundle size:** compiler 23,585,103 bytes raw, 3.45 MB gzip -9 (3.53 MB at gzip -6), 2.27 MB brotli (ticket 27); all 40 packs 798,953 bytes gzip (7.4 MB raw); name table 61,517 bytes. The first PureScript pick fetches only the pointer, manifest, compiler and name table (Chrome, local server: 152 to 515 ms to ready, compiler `WebAssembly.compile` 28 to 98 ms in the worker).
  - **Real network (proxy):** the bundle is not deployed, so GitHub Pages itself was measured with the app's own `ghcjs/frontend.wasm` (6.7 MB raw, served as 1,671,299 bytes gzip): 1.37 s on a cold edge (1.2 MB/s), 0.12 to 0.14 s warm (12 MB/s). That puts the compiler's 3.5 MB gzip at roughly 0.3 s warm to 3 s cold on this connection. This is an estimate, not a measurement of the bundle. Pages answers `Accept-Encoding: br, gzip` with **gzip** (no brotli) for HTML, JavaScript and `application/wasm`, with `cache-control: max-age=600` and an ETag; the 2.3 MB brotli figure is therefore not what players download, 3.5 MB is. No contradiction with the plan: the plan says "brotli" as a size figure only.
  - **Not measured, and why:** Safari (needs `safaridriver --enable`, an administrator step, and a Develop-menu setting; not possible in a non-interactive session); low-end or mobile devices (none to hand); the bundle on real GitHub Pages (not deployed until the app is wired to it, ticket 31/33); the real deployed Solution sandbox; the order of Cache Storage quota limits per browser. Second-visit behaviour is shown in Chrome (a reload with PureScript remembered makes one request, the pointer); Firefox made two pointer requests there, not investigated.

**Build and shipping**
- **`purs-core.wasm` is built in its own repository, [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm), and shipped as a GitHub Release asset** (amended 2026-11-06, replacing "a Nix package in the app's own `nix build`"). That repo holds the Nix recipe and a GitHub Actions workflow that builds the `gmp`-free GHC and `purs-core.wasm` (cold GHC about 1 h on a runner, then cached), pruned-GHC and Node smoke checks, and a release on a version tag. This repo fetches the released file with `fetchurl` and a pinned hash, so the app's `nix build` and `deploy.yml` never compile GHC. Externs and compiled library JavaScript (ticket 28) are built here from the pinned list, with the released wasm as input. The released wasm is the source of truth: a GHC rebuild does not reproduce its bytes.
- **Patches:** a patch file in this repo applied to pinned upstream (no fork). It lives in `jafonsor/purs-wasm` (`nix/purescript/purescript.patch`, entry point `purs-core-Main.hs`).
- **Toolchain:** a `gmp`-free wasm GHC 9.14 (flavour `perf+native_bignum`, no `--with-intree-gmp`), built from the `haskell-wasm/ghc` `ghc-9.14` branch, instead of the repo's prebuilt `gmp` one. This was proven in [ticket 14](issues/14-task-build-native-wasm-ghc.md): 34 min to build on a 10-core Mac, `purs-core` unchanged, byte-identical compiler output (not the wasm itself: rebuilds with a different GHC give different wasm bytes, see ticket 27), 2.28 MB brotli, same speed, no `gmp` in the binary. Recipe and scripts: `research/10-purs-wasm/` (`ghc-native-build.sh`, `ghc-native-install.md`, `ghc-native-install.sh`, `purs-core-build-with-native-ghc.sh`). No `gmp` licence note is needed for the compiler bundle (this reverses [ticket 13](issues/13-grilling-compiler-bundle-build-and-deploy.md)'s toolchain choice, per the owner). **Not yet done:** running the `native`-built compiler in a browser. Packaging it in Nix and building it on Linux CI is done in [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm): a cold GHC build took about 1 h on a GitHub runner (about 2 h 54 min under Docker with Rosetta), and the pruned install is about 84 MB as `tar.xz` ([research 12](research/12-ghc-wasm-compression.md)). Running the `native`-built compiler in a browser is still ticket 33's job. The app's own `frontend.wasm` still links `gmp`; that is unchanged by this spec (a `native` frontend build was shown to work only on the Obelisk-free prototype).
- **Libraries:** a committed list, `languages/purescript/packages.json`, is the source of truth, naming one pinned package-set release and, per library, its version, repository, commit and module names. The library sources are not committed; the Nix package fetches them and builds externs and compiled library JavaScript for exactly that list. puzzle-check fails if a Reference Solution imports a module outside the list, reading only the committed file; to compile, and to check imported names, it needs the sources in a folder named by `PURS_LIBS` (only where they are, never which).
- **Serving:** the bundle is separate from the main one, with a content hash in every file name (GitHub Pages sets no cache headers), kept in Cache Storage; old versions deleted when a new one is stored. A hashed manifest maps each library to its externs; a library's externs are fetched only when a Solution imports it. No CSP change (the page has none).
  - **As built (ticket 28; `tools/purs-bundle/`, `static/bundle/`, flake output `purs-bundle`):** the build writes, per library, one **pack** `<library>.<hash>.pack.gz` holding its sources, its modules' `externs.cbor` and compiled `index.js`/`foreign.js` (so "a library's externs" are fetched together with its JavaScript, in one request); a manifest `manifest.<hash>.json` (per library: file, sizes, `requires` = all libraries it needs, `modules`; module to library; compiler; `sourceMtime`); the compiler `purs-core.<hash>.wasm`; and the name table `names.<hash>.json` (module to exported names, with the clash preferences, for the import popup). The hash is the first 16 hex digits of the sha256 of the content (of the uncompressed pack for a pack, so a different zlib version does not rename it). Packs are gzip-compressed by us, so the size does not depend on what Pages compresses. Two builds of the same inputs give the same bytes with one Node version; across Node versions (Nix's and a developer's) the packs' gzip bytes differ, and with them the sizes the manifest records and so its own name, but the packs' names and decoded content do not (checked: the Nix build and a local Node 24 build have all 40 pack names identical). The Nix build is the one to deploy.
  - **One fixed name, the pointer** `current.json` (`{"manifest": "manifest.<hash>.json"}`), fetched with `cache: "no-cache"` (revalidates by ETag despite `max-age=600`). This is the one exception to "a content hash in every file name"; without it the page cannot learn the manifest's name without changing the app's own build.
  - **Cache Storage:** one cache, `purs-bundle`, holding the files of one manifest. Opening a manifest the cache does not hold deletes every cached file it does not name (a file whose hash did not change, such as the compiler, stays). Offline, the stored manifest is used.
  - **Compiler worker rules the data imposes (ticket 31):** build the tree with `assembleTree` and `librariesFor` (`static/bundle/purs-tree.mjs`); every file from a pack must report the manifest's `sourceMtime` as its modified time (sources, externs and JavaScript alike) and `Main.purs` a later one that moves with edits, else the compiler rebuilds the libraries (3 s for Prelude, 79 s for the `arrays` closure in Node); pass the compiler only the sources reachable from the Solution's imports (`sourcesFor`).
- **Download timing:** on the first PureScript pick, or at page load if PureScript is the remembered Language. JavaScript-only players pay nothing.
- **Reference Solution check:** puzzle-check compiles every PureScript Reference Solution with this compiler and fails on any error. This also guards against the 9.14 version drift. The check runs the same `purs-core.wasm` the browser downloads, in Node through WASI, as a runner behind `npm run solutions` ([ticket 21](issues/21-task-puzzle-check-runs-purs-wasm-in-node.md)); not a native `purs`, and not a browser.

**Check behaviour**
- One long-lived compiler worker, kept between checks; each check gets a fresh compiler instance in it with a persistent in-memory file tree. Compile timeout about 5 s (a safety net); only on timeout is the worker killed, and the new one rebuilds its tree from the saved downloads. The ~1 s timeout applies only to running the generated JavaScript against the tests, in a fresh sandbox as today. No spare worker.
- Library results are shipped, not persisted per check. No OPFS (an option if the first check feels slow). An optional low-priority warm-up compile of the Puzzle's Reference Solution runs after load and when a new Puzzle opens; a real check goes first.
- PureScript syntax errors report the line after the break, so an underline goes at the end of the last non-blank line before the reported position.

### Calling convention

([research 02](research/02-purescript-json-tests.md), ticket 04)

Calls are curried. Of 185 tests in 50 Puzzles, 31 Puzzles map to plain PureScript types; the rest:
- **Polymorphic lists** (`chunk`, `everyOther`, `positions`, `rotate`, `unique`, `grid`, `flatten`, `zip`): `forall a.`; `flatten` is one level; `unique` and `positions` need `Eq a =>`; `zip` returns `Array (Tuple a b)`, converted to JSON pairs by the harness.
- **One-value-type objects** (`countWords`, `groupByLength`, `invert`, `mergeCounts`, `toggleFlags`, `topScorer`, `totalCost`) and `pick` (`forall a. Object a -> Array String -> Object a`, which also takes mixed values): `Object a`.
- **Mixed-value objects:** `queryString` keeps an advanced type, `forall r rl. RowToList r rl => Keys rl => Record r -> String`, with a `Keys` class the Solution writes and walks over the row (the harness builds its dictionary, see below); `withDefaults` too: `forall a b c d. Union a b c => Nub c d => Record a -> Record b -> Record d`, solved by `Record.merge` (`Record` library; `Union` and `Nub` from `Prim.Row`). Tests untouched.
- **`getPath`**: `Json -> String -> Json` (`Data.Argonaut.Core`, `argonaut-core`), a deliberate interop Puzzle. Tests untouched.
- So every Puzzle gets a PureScript Solution; L4 holds with no exceptions.
- **Settled by compiling** (ticket 23, `purs` 0.15.16, package set `psc-0.15.16-20261104`; all 12 hard Puzzles pass `npm run solutions -- --lang=purescript`):
  - `Type.Proxy` is the right module name; it lives in the `prelude` library (v6.0.3), not a separate package. `RowToList`, `Cons` and `Nil` come from `Prim.RowList`, `Union` and `Nub` from `Prim.Row`; the pinned-library lint lets `Prim.*` through.
  - **Dictionary passing is as guessed, and wider.** Every constraint in a function's type is one extra leading argument: `unique(dictEq)(items)`, `positions(dictEq)(items)(value)`. Row-solved constraints (`Union`, `Nub`, `RowToList`) take an argument too, and ignore it: `withDefaults()()(options)(defaults)` in the compiled JavaScript. The tests carry only JSON, so the harness reads the constraints off the function's signature in the Solution text (`dictionaryKinds` in `tools/puzzle-check/purs-runner.js`) and supplies one argument per constraint, in order: for `Eq` the dictionary `{eq: a => b => a === b}` (what `Data.Eq` builds for `Int`, `String` and `Boolean`; it does not compare nested arrays structurally), for any other class `{}`. The browser harness must do the same. A dictionary with real methods (`Ord`, `Show`, a user-written class) cannot be supplied by hand; the typed path below has the compiler build it.
  - **`Tuple` is as guessed.** `Data.Tuple.Tuple` compiles to a JavaScript class named `Tuple` with `value0` and `value1`; the worker's `constructor.name === "Tuple"` check works (`zip` passes). A bundler that renames classes would break it (the browser worker should keep names or check `value0`/`value1` shape on instances of the `Data.Tuple` module's `Tuple`).
  - **`queryString` keeps the RowToList-and-class type** (ticket 35). A user-written class's dictionary holds methods that depend on each test's record shape, which JSON cannot give the harness, so the harness has the compiler build it: **the typed path**. When a function's signature has any constraint other than `Eq` or a row-solved one (`Union`, `Nub`, `Lacks`, `Cons`, `Append`), the runner writes a module `Harness` next to the Solution, one function per test, `t0 _ = queryString { "page": 2, "q": "cats" }`, with the arguments as PureScript literals typed from the test's JSON, and compiles both in the same compiler run; the compiler picks the instances, and the worker calls `t<i>()` and compares as before. Tests stay JSON and Language-neutral (L2). JSON to PureScript: string -> `String`; integer within 32 bits -> `Int`; any other number -> `Number`; boolean -> `Boolean`; object -> record with quoted labels, nested objects nested records; array -> `Array` of one element type. Anything else fails with a readable message naming the test and the place (`test 2 args[0].a[0]: null has no PureScript type`): `null`, an array of mixed types, an empty array (no element type), a string with a character outside printable ASCII, a number written with an exponent. A test whose values the Solution has no instance for (for example a `Boolean` field where only `String` and `Int` have a `Field` instance) fails as "the generated test module does not compile: line:col message". The Solution's own compile errors are reported as before. This also lets `Ord` and `Show` constraints through, since the compiler resolves them at the test's concrete types. **What it still cannot do:** call a function that takes `Json`, `Object a`, `Maybe`, `Either`, `Tuple` or a function as an argument and also has a typed constraint (the literals are plain records, arrays and scalars); and anything where the test's values do not fix the types (empty arrays). **Cost, measured** (ticket 35, Node, `purs` 0.15.16, a busy machine with load average 10, median of 8 warm checks): `queryString` 1.19 s against 1.23 s for `chunk` and 1.20 s for `withDefaults`: no measurable difference, because the `Harness` module is one small extra file in the same compiler run (no second compile and no second process); the dominant cost is the compiler loading the libraries' externs, same for every Puzzle. The first check of a process pays that load once (25 s on the same loaded machine; about 3.5 s unloaded per ticket 21). The cheap path (Eq dictionary, `{}`) is unchanged for the other 11 Puzzles. The browser worker (ticket 31) must apply the same rule and measure it again.
  - Libraries used: `prelude`, `arrays`, `maybe`, `tuples`, `strings`, `foreign-object`, `argonaut-core`, `record` and their dependencies (list in ticket 23's Comments).

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

- **`languages/<name>/` per Language, JavaScript included.** JavaScript's length limits and symbol list move out of the `write-puzzle` skill and `tools/puzzle-check` into its folder. A PureScript folder holds: the pinned package list (read by the app build and puzzle-check), a reference to the compiler patch, a config (`language.json`: length limits, symbol list, timeouts; with `calling-convention.md`), the preference list (`name-clashes.json`) for names two modules export (for example `filter` in `Data.Array` and `Data.List`), and `authoring.md` (style advice, traps). A second Language adds a folder; the skill and the check do not change.
- **puzzle-check** reads those folders (`tools/puzzle-check/languages.js`): runs each Language's Reference Solutions in that Language's runner, enforces limits, and prints a symbol coverage table **per Language** (goal: every symbol in at least 5 of that Language's Reference Solutions; never fails). The exact PureScript symbol list is tuned once real Reference Solutions exist. It also lints prompts for Language-specific call syntax and verifies every name a Reference Solution imports is exported by the module it is imported from (the name table, read from the library sources by `purs-exports.js`; skipped with a printed note when the sources are absent).
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
