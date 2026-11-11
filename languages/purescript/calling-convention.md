# PureScript: calling convention

How a test's JSON `args` and `expected` become a call and a comparison. Settled by compiling every Reference Solution with `purs` 0.15.16 (spec "Calling convention"; tickets 23 and 35). The checker is `purs-core.wasm`; puzzle-check's runner is `tools/puzzle-check/purs-runner.js`, and the browser Checker behaves the same: `static/editor/src/languages/purescript/calling.mjs` (the constraint kinds and the typed path's Harness module) and `sandbox.js` (the call, the pass rule, Tuple handling). `tools/puzzle-check/test/browser-twin.test.js` compares the two on every Puzzle and on odd inputs, so they cannot drift.

**Calls are curried.** `f(a)(b)(c)`. Results are compared as JSON, with `Tuple` converted to a JSON pair (the generated JavaScript class is named `Tuple` with `value0`, `value1`; a bundler that renames classes breaks the check).

**Parameter names** in the signature follow the order the tests pass the arguments.

**Dictionaries.** Every constraint in a function's type is one extra leading argument: `unique(dictEq)(items)`. Row-solved constraints (`Union`, `Nub`, `Lacks`, `Cons`, `Append`) take an argument too and ignore it. The harness reads the constraints off the signature text and supplies, per constraint, in order: `{eq: a => b => a === b}` for `Eq` (so it does not compare nested arrays structurally), `{}` for a row-solved one.

**The typed path.** Any other constraint (`Ord`, `Show`, `RowToList`, a class the Solution writes) has a dictionary that depends on the test's value types, which JSON cannot carry. The harness then writes a module `Harness` next to the Solution, one function per test (`t0 _ = queryString { "page": 2, "q": "cats" }`), with the arguments as PureScript literals, and compiles both in one compiler run; the compiler picks the instances, so tests stay JSON and Language-neutral.

- JSON to PureScript: string `String`; integer within 32 bits `Int`; other number `Number`; boolean `Boolean`; object a record with quoted labels; array an `Array` of one element type.
- Fails with a readable message naming the test and place: `null`, an array of mixed types, an empty array (no element type), a string with a character outside printable ASCII, a number written with an exponent.
- A test whose values the Solution has no instance for fails as "the generated test module does not compile".
- Cannot call: a function that takes `Json`, `Object a`, `Maybe`, `Either`, `Tuple` or a function and also has a typed constraint (the literals are plain records, arrays and scalars). Such a Puzzle uses only the cheap path.
- A Puzzle on the typed path needs tests whose values fix their types: no `null`, no empty arrays, no mixed arrays in its arguments.

**Timeouts.** Compile about 5 s (`timeouts.compileMs`, a safety net); running the generated JavaScript against the tests 1 s (`timeouts.runMs`).
