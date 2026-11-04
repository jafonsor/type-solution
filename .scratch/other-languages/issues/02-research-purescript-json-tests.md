Type: research
Status: resolved
Blocked by: none

# 02: How do PureScript Solutions meet JSON tests?

## Question

Puzzle tests are `args` (a JSON list) and `expected` (JSON). How would a PureScript function be called with them, and compared?

Survey the 50 Puzzles in `puzzles/` and report which JSON shapes occur in `args` and `expected` (numbers, ints versus floats, strings, booleans, null, arrays, nested arrays, objects), with counts. Then, from primary sources (PureScript language docs, `purescript-foreign`, `argonaut`, FFI docs), find how each shape would be:
- written in a PureScript signature (`Int`, `Number`, `String`, `Array`, `Maybe`, records, `Tuple`);
- passed in, given that PureScript functions are curried and compiled output differs from JS calling conventions;
- read back from the result and compared.

Say which JS shapes have no natural PureScript type (null, mixed arrays, objects with arbitrary keys, `undefined`), and how many of the 50 Puzzles they affect.

Capture the findings under `.scratch/other-languages/research/`.

## Answer

Of the 50 Puzzles, 31 use only `Int`, `String`, `Boolean` and arrays of them, and need no translation: PureScript's numbers, strings, booleans, arrays, records and `Object a` are plain JS values at runtime, so JSON goes in (called curried, `f(a)(b)`) and the result compares with today's deep-equal. No test has `null`, `undefined` or a decimal (all 185 tests use whole numbers within +-9999). 12 Puzzles lack a single plain type (8 are polymorphic lists, 4 have mixed-value objects), 7 more need `Object a`, and `zip` forces a `Tuple` (not raw JSON). Unverified without a compiler: type-class dictionary arguments (`unique`, `positions`). Details: [research/02-purescript-json-tests.md](../research/02-purescript-json-tests.md).
