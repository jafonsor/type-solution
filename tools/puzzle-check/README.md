# Puzzle bank check

Proves every Puzzle file in `puzzles/` is sound. From the repo root:

```sh
npm ci --prefix tools/puzzle-check          # once, installs the TOML parser
npm run check --prefix tools/puzzle-check   # checks every file in puzzles/
```

It exits 1 and prints `FAIL <file> (Puzzle <identity>)` with the reasons if any Puzzle file:

- isn't valid TOML, misses one of `function`, `signature`, `prompt`, `reference`, `tests`, has any other key, or has a test that isn't exactly `args` (a list) and `expected` (JSON values: no dates, NaN or infinity), or has no tests. These are the build's rules (`common/src/Common/Puzzle.hs`), plus "at least one test";
- has a Reference Solution that fails a test (named by its number and call), crashes, doesn't define the function, or runs longer than 1 s;
- has a Reference Solution outside 4–12 non-blank lines or 100–350 characters. Each line's leading whitespace is removed and blank lines are dropped; characters are the code points left on the lines, line breaks not counted.

The tests run through the browser's own test-runner script, `static/src/js/runner.js`, unchanged: `runner-host.js` hosts it in a Node worker, sends it the browser's request and reads its reply.

It always prints a symbol report: for each target symbol, how many Reference Solutions contain it and how many times it occurs in all of them. Symbols in fewer than 5 Reference Solutions are marked. The report never fails the check; the authoring rules ask for every symbol in at least 5 Reference Solutions across the bank.

`node check.js <folder>` checks another folder. `npm test --prefix tools/puzzle-check` runs the check's own tests, on the Puzzle files in `test/fixtures/` (kept out of `puzzles/`, which the build embeds whole).

## Running every Solution in every Language

```sh
npm run solutions --prefix tools/puzzle-check                      # all Puzzles, all Languages
npm run solutions --prefix tools/puzzle-check -- --lang=javascript --puzzle=clamp
```

`run-solutions.js` prints a Puzzle × Language table (`ok` / `FAIL`, with the failing tests under it) and exits 1 if any Solution fails or a Language has no runner. It only runs the tests; the length and symbol rules stay in `npm run check`. Today every Puzzle has one Solution, in JavaScript. For another Language, make `solutionsOf` read its Solutions from the Puzzle file and add its runner to `runners`.

### PureScript

`purs-runner.js` is the `purescript` runner. It compiles a Reference Solution with `purs-core.wasm`, the compiler the browser downloads, in Node through WASI, then runs the generated JavaScript against the tests (curried calls; `Tuple` results become JSON pairs; same pass rule and 1 s timeout as the JavaScript runner). It also fails a Solution whose imports aren't one line or name a module outside the pinned libraries.

- `PURS_WASM=/path/to/purs-core.wasm` is required. Unset, every PureScript row fails with "no compiler configured for purescript".
- `PURS_LIBS=/path/to/libs` is a folder of pinned library checkouts (`<name>/src/**/*.purs` with their `.js` files). Until the pinned list is committed under `languages/purescript/`, this folder is the list.

The first check builds the libraries' externs (about 3.5 s for Prelude); later checks take 0.2 to 0.4 s. Positions in compile errors refer to the Solution text as written. A Puzzle file may now carry a `[purescript]` table (`signature`, `reference`), placed after the top-level keys; `run-solutions.js` then shows a `purescript` row for it. The build's own parser (`Puzzle.hs`) still rejects that table, so none may go into `puzzles/` until it accepts it. `npm test` exercises the runner with the fixtures in `test/purs-fixtures/` and `test/fixtures/purescript-table/`, skipping the ones that compile unless both variables are set.
