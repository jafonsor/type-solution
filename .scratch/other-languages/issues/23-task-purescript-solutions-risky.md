Type: task
Status: resolved
Blocked by: 22; needs a `purs-core.wasm` (ticket 21 shows how to run one)

# 23: Write the PureScript Reference Solutions that might not type: prove the approach

## What to build

Build order step 1, riskiest first. Write and compile with the wasm compiler, puzzle-check as judge: `getPath` (`Json`), the 8 polymorphic-list Puzzles (`chunk`, `everyOther`, `positions`, `rotate`, `unique`, `grid`, `flatten`, `zip`), the 4 mixed-value-object Puzzles (`pick`, `queryString`, `withDefaults`, `getPath`). Settle the unverified items in spec "Calling convention": the `Type.Proxy` module name, dictionary passing for `Eq a =>` (`unique`, `positions`), the runtime shape of `Tuple` (ticket 21's worker assumes a class named `Tuple` with `value0` and `value1`).

## Acceptance

- [x] Each of these Puzzles has a `[purescript]` table that passes `npm run solutions`.
- [x] Any Puzzle that cannot be typed is reported to the owner with the options in the spec (change its tests for every Language, or hold PureScript back).
- [x] The calling-convention notes are corrected in the spec and the runner if the guesses were wrong.
- [x] Libraries these need are listed for ticket 25.

## Comments

All 12 Puzzles pass: chunk, everyOther, positions, rotate, unique, grid, flatten, zip, pick, getPath, withDefaults, queryString. The other 38 `[purescript]` tables are still placeholders (ticket 24).

**Not typed as the spec sketched: `queryString`.** The RowToList-plus-user-class type compiles, but a JSON-driven harness cannot build the class dictionary for each test's record shape, so it can never be called. The Reference Solution is `queryString :: Object Json -> String`, tests untouched. For the owner to confirm; the spec's options (change tests for every Language, or hold PureScript back) do not help here, since the tests are not the obstacle. Everything else keeps its sketched type, `withDefaults` included (`Union`/`Nub` with `Record.merge`).

**Calling convention, corrected** (spec "Calling convention" and `purs-runner.js`, `purs-test-worker.js`): the `Eq a =>` guess was right but too narrow. Every constraint, row-solved ones too, is an extra leading argument. The runner now reads the constraints off the signature in the Solution text (`dictionaryKinds`) and supplies an Eq dictionary or `{}`. `Type.Proxy` is in `prelude`; `Tuple` is a class named `Tuple` with `value0`/`value1` (guess right).

**Libraries these need** (for ticket 25). Package set `purescript/package-sets` tag `psc-0.15.16-20261104`; each library at the tag below, from its own repo (`purescript/purescript-<name>`, `purescript-contrib/purescript-argonaut-core`). Used directly: prelude, arrays, maybe, tuples, strings, foreign-object, argonaut-core, record; the rest are their dependencies (the transitive closure is these 40, verified: the 12 Solutions compile and pass with only these in `PURS_LIBS`).

| library | version | commit |
|---|---|---|
| argonaut-core | v7.0.0 | 68da81dd80ec36d3b013eff46dc067a972c22e5d |
| arrays | v7.3.1 | 1eb920e32bf23aa4b74e0c7613b532b8338ce84a |
| bifunctors | v6.1.1 | 0b7fbbba1daeb7490fb708c4c0c05ac11f25e323 |
| const | v6.0.1 | d0960c847a4a76392076a6bfa3f12afcc0e174fc |
| contravariant | v6.0.1 | e8424464c9380fdf756f97af44707aa4e6d29193 |
| control | v6.0.1 | 4c249cd216bfcc8dde56bd9352b8552255f6107f |
| distributive | v6.0.1 | 1e49a987f786a75dc4870f3de926b45ebb09d7c5 |
| effect | v4.0.1 | ebe3af24726423f6a989a4391c9391126f9f0657 |
| either | v6.1.1 | 8ecd05119607c0381617e4594ea60dcb5b3e514a |
| enums | v6.0.2 | d99d0fa472ae130fde2c9fa31767c348c08fbbbf |
| exists | v6.0.1 | a4d43c56bcea7c4aa444bb503d689a031e098048 |
| foldable-traversable | v6.0.1 | 91fc37f65fa2b90f05218bcb89e596922afca52d |
| foreign-object | v4.1.1 | 28b4d6d29a4fec706dd853e90def7f475a1dd1b7 |
| functions | v6.0.1 | a72baf3c8f23275657c680ed06ab9a56287f7b21 |
| functors | v5.0.1 | 79475a12dbf5ea7527991258e2c063a207019e28 |
| gen | v4.0.1 | f03cf90a06779e295c19005aee3cbaff4a78b707 |
| identity | v6.0.1 | 3a2b730b82781aa53f44690c787786449cf1d24a |
| integers | v6.0.1 | 98f2f52bd5a702ddeb0692ac3df30a9785158eb6 |
| invariant | v6.0.1 | beb8754fcc64eec0e626e7f013a39f6eeeb7bb9f |
| lazy | v6.0.1 | 69b11922cee3a0bb13972467c7c96064202a9a90 |
| lists | v7.0.1 | 12835f00fd28e665b5ea8761dae17fa533909fc2 |
| maybe | v6.0.1 | 103367280a5949060885ad51222229afbe3f8a47 |
| newtype | v5.0.1 | 38edc0eaefe1363be914bdaf6272297119e04e43 |
| nonempty | v7.0.1 | cc21ca231e6e6c86a138dc7271ab93b931c4e327 |
| numbers | v9.0.2 | 7495a5e40f8a8c4f3ea2e76b16ea47ea3a9ac7ad |
| orders | v6.0.1 | 21e38b07cef4ed1b280d1dc3681b5e0c2bf724be |
| partial | v4.0.1 | 57b2ccc66b70329fdcf135383069330b1bf9f6b7 |
| prelude | v6.0.3 | e789260bb354071f8d43ed482e821b9381855315 |
| profunctor | v6.0.2 | 4792fba1efdd00e07c74d1d058034cc4a41eb38f |
| record | v4.0.1 | 8ebda0160b96cbc993e87c6751177473fc68e247 |
| refs | v6.0.1 | 2644e5fa62abe1aabd4f94de87766ef3ea3dcd60 |
| safe-coerce | v2.0.1 | 6e9178327faccb884832d945316ab311e3be2919 |
| st | v6.2.1 | 51da14504ab71b8bb6044c731005a4be681d11be |
| strings | v6.1.0 | 7bb86e620d2f76c23bf982a846d770f3eaf855f4 |
| tailrec | v6.1.1 | 45315fb4530adc3663154bda6357a8170464461c |
| tuples | v7.0.1 | 1b16e48810ce568d01770fa0fa8ab7b376499fa7 |
| type-equality | v4.0.2 | c5dd108e22867e705c3b0185b17a790d1b181743 |
| typelevel-prelude | v7.0.1 | 87a4ece22de212ffdc291d7a2c6df0596108fa16 |
| unfoldable | v6.0.1 | fe93e9a86c760174989c5d6e048c3533dc281f24 |
| unsafe-coerce | v6.0.1 | 8888c0d9b55972c3ce61147be7345492ddd7fb00 |

Note for ticket 25: the Reference Solutions import `Data.Array`, `Data.Maybe`, `Data.Tuple`, `Data.String`, `Data.Argonaut.Core`, `Foreign.Object`, `Record`, and `Prim.Row` (built in). `import Prelude` is explicit in every Solution except `withDefaults` (unused there).

Decision (owner, 2026-11-05): keep `queryString` as the advanced type (`RowToList` plus a user class). The harness must build the dictionaries; that is ticket 35. Until 35 lands, the committed `Object Json -> String` is an interim Solution.
