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
