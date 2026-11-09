# Puzzle bank check

Proves every Puzzle file in `puzzles/` is sound. From the repo root:

```sh
npm ci --prefix tools/puzzle-check          # once, installs the TOML parser
npm run check --prefix tools/puzzle-check   # checks every file in puzzles/
```

The Languages are the folders under `languages/` (`languages/<name>/language.json`: length limits, symbol list, import line pattern, timeouts; plus the Language's notes). The check iterates over whatever folders it finds, so a new Language is a new folder and no change here: its table in every Puzzle file, its limits and its coverage table are enforced and printed (see `languages.js`). Running its Solutions needs a runner in `run-solutions.js`.

It exits 1 and prints `FAIL <file> (Puzzle <identity>)` with the reasons if any Puzzle file:

- isn't valid TOML, misses one of `function`, `prompt`, `tests` or a table per Language folder (each holding exactly `signature` and `reference`), has any other key or table, or has a test that isn't exactly `args` (a list) and `expected` (JSON values: no dates, NaN or infinity), or has no tests. These are the build's rules (`common/src/Common/Puzzle.hs`, which names the Language tables itself), plus "at least one test";
- has a Reference Solution that fails a test (named by its number and call), crashes, doesn't define the function, or runs longer than 1 s (JavaScript only: the bank check does not compile other Languages, `npm run solutions` does);
- has a `signature` or `reference` in any Language table that is empty or only comments (a placeholder such as `-- placeholder until ticket 24`);
- has a Reference Solution outside its Language's `limits` (today JavaScript 4–12 non-blank lines and 100–350 characters, PureScript 4–30 and 100–900). Each line's leading whitespace is removed and blank lines are dropped; characters are the code points left on the lines, line breaks not counted. A Language's import lines (its `imports.linePattern`) are left out of both counts and of the symbol counts, since the editor inserts them;
- has a prompt with Language-specific call syntax (`promptProblems`): a camelCase call such as `isBalanced(`, the Puzzle's own function name followed by `(`, a `.method(` call, `=>`, `===`, `::`, `\x ->`, `const x =`, `function (`. Examples must be plain input → output pairs (`"internationalization" → "i18n"`, several inputs separated by commas);
- has a PureScript import that isn't one line (`import M (a, b)`: no `qualified`, `hiding`, `as`, wrapped lines), names a module outside the libraries on the committed pinned list (`languages/purescript/packages.json`; `Prim.*` is built in), or imports a name that the module does not export. The first two need only the committed file. The name check reads the library sources and needs `PURS_LIBS`; when it is unset or lacks pinned libraries the check prints a `Note:` saying names were not checked, and does not fail. `purs-exports.js` reads export lists without a compiler: `module M (...) where`, re-exported `module Y`, a module with no export list (every top-level declaration), operators, classes and `T(..)` (the members of `T(..)`/`T(A, B)` in an import list are not checked).

The tests run through the browser's own test-runner script, `static/src/js/runner.js`, unchanged: `runner-host.js` hosts it in a Node worker, sends it the browser's request and reads its reply.

It always prints a symbol report per Language (alphabetical by folder name, each with its own list of target symbols from its `language.json`): for each target symbol, how many Reference Solutions contain it and how many times it occurs in all of them. Symbols in fewer than 5 Reference Solutions are marked. The report never fails the check; the authoring rules ask for every symbol in at least 5 Reference Solutions across the bank, per Language.

`node check.js <folder>` checks another folder of Puzzle files; `--languages=<folder>` reads the Languages from another folder than the repo's `languages/`. `npm test --prefix tools/puzzle-check` runs the check's own tests, on the Puzzle files in `test/fixtures/` (kept out of `puzzles/`, which the build embeds whole).

## Running every Solution in every Language

```sh
npm run solutions --prefix tools/puzzle-check                      # all Puzzles, all Languages
npm run solutions --prefix tools/puzzle-check -- --lang=javascript --puzzle=clamp
```

`run-solutions.js` prints a Puzzle × Language table (`ok` / `FAIL`, with the failing tests under it) and exits 1 if any Solution fails or a Language has no runner. It only runs the tests; the length and symbol rules stay in `npm run check`. Every Puzzle has a Solution in each Language folder (`solutionsOf`); a Language without an entry in `runners` shows as a failing row.

### PureScript

`purs-runner.js` is the `purescript` runner. It compiles a Reference Solution with `purs-core.wasm`, the compiler the browser downloads, in Node through WASI, then runs the generated JavaScript against the tests (curried calls, with one extra leading argument per constraint in the function's type, read off its signature in the Solution text: an `Eq` dictionary for `Eq`, `{}` for a row-solved one (`Union`, `Nub`, ...); `Tuple` results become JSON pairs; same pass rule and 1 s timeout as the JavaScript runner). It first runs the same import check as the bank check (one-line imports, modules on the pinned list, and names when the sources are there), which needs neither the compiler nor the sources.

- `PURS_WASM=/path/to/purs-core.wasm` is required. The repo pins the released compiler in `purs-wasm.nix` (a `fetchurl` of the `purs-wasm` GitHub Release asset with its sha256; flake output `purs-core-wasm`, not the default package, so the app's `nix build` is unchanged). Use it with `PURS_WASM=$(nix build .#purs-core-wasm --no-link --print-out-paths)`, or `-o purs-link` and `PURS_WASM=$PWD/purs-link`. Without Nix, download `purs-core.wasm` from the release and check it against the release's `purs-core.wasm.sha256`. Unset, every PureScript row fails with "no compiler configured for purescript".
- `PURS_LIBS=/path/to/libs` says where the library sources are: a folder holding a checkout of each pinned library as `<name>/src/**/*.purs` with its `.js` files. The sources are not committed. Which libraries, versions and commits they must be is `languages/purescript/packages.json` (package set `psc-0.15.16-20261104`; each library's `repo` and `commit` are there). Only the pinned libraries are copied for the compiler; a pinned library missing from the folder fails the PureScript rows ("lacks pinned libraries"). PURS_LIBS is used only to compile and to check imported names; it is never the list. Unset, the compiling rows fail with "no library sources for purescript"; the bank check still runs, with a `Note:`. There is no environment variable for the list itself.

**The typed path.** A function with any other constraint (`RowToList`, `Ord`, `Show`, a class the Solution defines, as in `queryString`) has dictionaries that depend on the types of each test's values, which JSON cannot carry. The runner then writes a module `Harness` with one function per test (`t0 _ = queryString { "page": 2, "q": "cats" }`), the arguments being literals typed from the test's JSON, and compiles it with the Solution in the same compiler run; the compiler picks the instances. Mapping: string `String`; integer in 32 bits `Int`; other number `Number`; boolean `Boolean`; object a record (quoted labels); array an `Array` of one element type. `null`, mixed arrays, empty arrays, non-ASCII strings and exponent numbers fail with a message naming the test and the place (`cannot call f from the tests: test 2 args[0].a[0]: null has no PureScript type`); a test whose types the Solution has no instance for fails with "the generated test module does not compile". Not callable this way: a function that also takes `Json`, `Object a`, `Maybe`, `Tuple` or a function as an argument. Cost: no measurable difference per check (median of 8 warm runs on a busy machine: `queryString` 1.19 s, `chunk` 1.23 s, `withDefaults` 1.20 s); the extra module rides in the same compiler run. The browser worker must follow the same rule (ticket 31).

The first check builds the libraries' externs (about 3.5 s for Prelude); later checks take 0.2 to 0.4 s. Positions in compile errors refer to the Solution text as written. Every Puzzle file carries a `[javascript]` and a `[purescript]` table (`signature`, `reference`), placed after the top-level keys; a file missing one fails the bank check, and `run-solutions.js` shows a row per Language for each Puzzle. The build's parser (`Puzzle.hs`) reads the same shape. All 50 `[purescript]` tables in `puzzles/` hold real Solutions (tickets 23 and 24), and the bank check fails a placeholder or empty one. The bank check does not run the compiler: it runs the JavaScript Reference Solutions, checks the PureScript ones' length and prints their symbol report; compiling and running them is `npm run solutions` (with `PURS_WASM` and `PURS_LIBS` set; about 90 s for the whole bank). `npm test` exercises the runner with the fixtures in `test/purs-fixtures/` and `test/fixtures/`, skipping the ones that compile unless both variables are set; `test/languages.test.js` builds throwaway Language folders and library trees in a temporary folder (a third Language, changed limits and symbols, the pinned list, the name check, the prompt lint).

### Bumping the compiler

The compiler is built in [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm), not here. To move to a new one:

1. In `purs-wasm`, push a version tag (`v0.15.16-2`, ...). Its `release` job publishes `purs-core.wasm`, `ghc-wasm-native-x86_64-linux.tar.xz`, their `.sha256` files and `BUILDINFO.json`.
2. Here, in `purs-wasm.nix`, set `tag` to the new tag and `sha256` to the hash in the release's `purs-core.wasm.sha256` (or `nix store prefetch-file --hash-type sha256 --json <url>`, then `nix hash convert` if you want SRI).
3. Run `PURS_WASM=$(nix build .#purs-core-wasm --no-link --print-out-paths) PURS_LIBS=<libs> npm run solutions --prefix tools/puzzle-check -- --lang=purescript` (50 of 50) and `npm test --prefix tools/puzzle-check` (no skips). A rebuilt compiler gives different wasm bytes even from the same inputs, so the released file, not a local rebuild, is the reference.
