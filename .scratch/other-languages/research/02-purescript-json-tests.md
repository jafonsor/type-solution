# Research: how PureScript Solutions meet JSON tests

Ticket: [../issues/02-research-purescript-json-tests.md](../issues/02-research-purescript-json-tests.md)
Date: 2026-10-26

## Plain-language summary

- **Most Puzzles are easy.** 31 of the 50 use only whole numbers, text, true/false and lists of those. A PureScript function for these can be handed the test's JSON values as they are, and its answer compared with the code that compares JavaScript answers today. No translation layer. (PureScript's own docs say its numbers, text, booleans and lists *are* JavaScript's at runtime.)
- **No Puzzle uses `null`, `undefined` or a decimal number.** Every number in all 185 tests is a whole number between -9999 and 9999. The classic JSON-to-typed-language trouble spots do not occur in the bank today.
- **The hard part: PureScript wants one fixed type per function, and some JSON tests do not have one.** 12 Puzzles lack a single plain type: 8 work on lists of *anything* (numbers in one test, text in the next), and 4 pass objects whose values mix numbers and text. A further 7 use objects with arbitrary keys; those do have a natural type (`Object a`, a string-keyed map), just not a record.
- **`Maybe`, `Tuple` and `Either` are not plain JSON at runtime.** `zip` returns pairs, so it needs a `Tuple` plus a conversion, or a two-item array. No Puzzle needs `Maybe`.
- **Calling is different**: PureScript functions take one argument at a time, so `chunk(items, size)` is called as `chunk(items)(size)`.

## Sources and method

- PureScript facts come from primary sources: the PureScript documentation repo (`purescript/documentation`), the compiler CHANGELOG, and the source of the libraries the ticket names (`purescript-argonaut-codecs`, `purescript-foreign`, `purescript-foreign-object`, `purescript-integers`, `purescript-functions`, `purescript-tuples`), read at their default branches on 2026-10-26, not pinned to release tags.
- The Puzzle survey is my own: I parsed all 50 files in `puzzles/` (Python `tomllib`, which keeps `1` and `1.0` apart) and classified every value in `args` and `expected`.
- **Nothing here was compiled or run.** There is no `purs` on this machine. Claims marked **[inference]** are mine, not stated in a source I read; confirm them once a compiler is at hand (ticket 01).

## 1. The 50 Puzzles: which JSON shapes occur

185 tests, 286 argument values, 185 expected values.

| Shape (whole argument or expected value) | `args` values | Puzzles | `expected` values | Puzzles |
|---|---:|---:|---:|---:|
| integer | 112 | 20 | 33 | 9 |
| string | 74 | 18 | 59 | 16 |
| boolean | 1 | 1 | 23 | 5 |
| array of integers | 35 | 12 | 24 | 10 |
| array of strings | 17 | 9 | 4 | 4 |
| array of booleans | 2 | 1 | 0 | 0 |
| array of arrays (ints, strings, bools; 3 `args` are `flatten` at varying depth) | 3 | 1 | 10 | 5 |
| empty array | 1 | 1 | 6 | 5 |
| array of mixed-type pairs (`[[1,"a"],...]`) | 0 | 0 | 2 | 1 (`zip`) |
| object | 41 | 11 | 23 | 9 |
| decimal number | 0 | 0 | 0 | 0 |
| `null` / `undefined` | 0 | 0 | 0 | 0 |

(A Puzzle can appear in several rows. Largest absolute number 9999; 14 negative values; nothing near the 32-bit limit. `partition`'s `expected` also holds one array-of-arrays value mixing empty and non-empty lists, counted under array of arrays.)

### Shapes per Puzzle (50 in total: 31 + 8 + 7 + 4)

- **31 plain and monomorphic** (every argument and the result is `Int`, `String`, `Boolean` or an array of those, one type throughout): abbreviate, baseName, clamp, collatzSteps, countVowels, differences, digitSum, dotProduct, fizzBuzz, formatTime, gcd, initials, isBalanced, isLeapYear, isPalindrome, isPrime, isStrongPassword, maskCard, partition, percent, plural, range, reverseWords, rockPaperScissors, runningTotal, scale, slugify, takeBelow, triangleType, truncate, wrapTag.
- **8 whose element type changes between tests** (need `forall a.`): chunk, everyOther, positions, rotate, unique (ints in some tests, strings in others), grid (fill value int, string or boolean), flatten (ints, strings, and a test one level deeper, so `a` is itself an array), zip (booleans, ints, strings; result pairs are `[int, string]`).
- **7 with string-keyed objects of one value type**: countWords (`Int`), groupByLength (`Array String`, keys are digits like `"3"`), invert (`String`), mergeCounts (`Int`), toggleFlags (`Boolean`), topScorer (`Int`), totalCost (`Int`). Key sets differ per test, so a fixed record does not fit; `Object a` does.
- **4 with objects of mixed value types**: pick (`{name:"Ada", age:36, city:"London"}`), queryString (`{q:"cats", page:2}`), withDefaults (`{size:2, color:"red"}`, `{mute:true, volume:5}`), getPath (nested objects; the result may be an int, a string or an object depending on the path string).

## 2. How each shape is written in a PureScript signature

Runtime facts: [PureScript docs, Types](https://github.com/purescript/documentation/blob/master/language/Types.md) unless noted.

| JSON shape | PureScript type | Runtime fact |
|---|---|---|
| integer | `Int` | "a normal JavaScript number", with `(+)` etc. defined so results stay `Int`. The docs do not state the 32-bit range; `Data.Int.fromNumber` gives `Nothing` unless the number is an integer "within the valid range of values for the `Int` type" (purescript-integers, `Data/Int.purs`). |
| decimal (none in bank) | `Number` | "correspond to their JavaScript equivalents at runtime" |
| string, boolean | `String`, `Boolean` | same |
| array, one element type | `Array a` | "correspond to Javascript arrays at runtime, but all elements in an array must have the same type" |
| object, fixed known keys | record `{ a :: Int }` | "correspond to JavaScript objects" |
| object, arbitrary keys, one value type | `Object a` (`Foreign.Object`) or `Map String a` | `Object a` "represents a homogeneous JS Object with values of type `a`", kept unwrapped, keys are `String` (purescript-foreign-object, `Foreign/Object.purs`) |
| `[x, y]` of different types | `Tuple a b` | `data Tuple a b = Tuple a b` (purescript-tuples): an ordinary data type, not a raw array |
| `null` | `Maybe a` | see section 4 |
| list of anything | `forall a. Array a` | "for any type `t0`, `identity` can be given a value of type `t0`" |
| mixed values | no plain type: `Json` (argonaut-core), `Foreign`, or a hand-made sum type | `foreign import data Foreign :: Type`; `unsafeToForeign = unsafeCoerce` (purescript-foreign, `Foreign.purs`) |

An `Array` cannot hold ints and strings together (same-type rule). In the bank that appears only inside `zip`'s result, where each inner pair is `[int, string]`, which is what a `Tuple` is.

## 3. Passing the arguments in

- **One argument at a time.** "PureScript functions always get turned into Javascript functions of a single argument", example `gcd(15)(20);` ([FFI guide](https://github.com/purescript/documentation/blob/master/guides/FFI.md)); Types.md: "always have exactly one argument". So a harness calls `fn(args[0])(args[1])...`. Every Puzzle has 1 to 3 parameters.
- **Many-argument escape hatch**: `Data.Function.Uncurried` (`Fn2`, `runFn2`, `mkFn2`). Its JS: `mkFn2 = fn => (a, b) => fn(a)(b)`; `runFn2 = fn => a => b => fn(a, b)` (purescript-functions). A harness does not need it.
- **ES modules since 0.15.0**: "Switch to ES modules"; FFI files use `export const name = value;` ([compiler CHANGELOG](https://github.com/purescript/purescript/blob/master/CHANGELOG.md), FFI guide). Where the compiled Solution lives and how a worker loads it is ticket 01.
- **Raw JSON can go straight in** for `Int`, `Number`, `String`, `Boolean`, `Array`, record and `Object a` arguments, since those are plain JS values at runtime. **[inference]** from the sentences above.
- **`Tuple`, `Maybe`, `Either` arguments are not raw JSON.** With argonaut, `decodeJson` turns `[a, b]` into a `Tuple` (`decodeTuple`: `[ a, b ] -> Tuple <$> decoderA a <*> decoderB b`, `_ -> Left $ TypeMismatch "Tuple"`). No Puzzle takes a pair as an argument; the bank only returns pairs.
- **Type-class constraints [inference, unsourced].** A signature like `forall a. Eq a => Array a -> Array a` is, as far as I know, compiled with the class dictionary as an extra first argument, so a harness would call `unique(dictEq)(items)`, or the signature must be monomorphic. The [Type Classes page](https://github.com/purescript/documentation/blob/master/language/Type-Classes.md) says nothing about runtime representation, so I found no primary source. Affects at most `unique` and `positions`. Verify with a compiler.

## 4. Reading the result back and comparing

**(a) Compare as raw JavaScript, no codec.** When the result is `Int`, `Number`, `String`, `Boolean`, an `Array` of those, a record or an `Object a`, the returned value is already a plain JS value (section 2), so the existing deep-equal against `expected` works unchanged. That covers the 31 plain Puzzles, the 7 homogeneous-object Puzzles, and the polymorphic-list ones except `zip`. **[inference]**

**(b) Convert through `argonaut-codecs`** when the result is not raw. `EncodeJson` has instances for `Int`, `Number`, `String`, `Boolean`, `Unit`, `Array`, `Foreign.Object`, records, `Maybe`, `Tuple`, `Either`, `Set`, `Map` and more (`Encode/Class.purs`). From `Encode/Encoders.purs`:
- `Maybe`: `encodeMaybe encoder = case _ of Nothing -> jsonNull; Just a -> encoder a` (so `Nothing` is `null`, `Just a` is the bare value).
- `Tuple`: `encodeTuple encoderA encoderB (Tuple a b) = fromArray [ encoderA a, encoderB b ]` (a two-item array).
- `Unit`: `null`. `Foreign.Object`: a JSON object (`fromObject <<< map encoder`).
- `Json` itself: `encodeJson = identity`, `decodeJson = Right`, so a mixed-value object can be typed `Object Json`.

Decoding (`Decode/Decoders.purs`, `Decode/Class.purs`): `decodeInt = note (TypeMismatch "Integer") <<< fromNumber <=< decodeNumber` (so `2.5` is an error, never rounded); `decodeMaybe` gives `Nothing` when `isNull json`; a record field typed `Maybe` that is missing decodes to `Nothing`, any other missing field is `Left (AtKey ... MissingValue)`.

**`purescript-foreign`** is the other primary tool for untyped data: `readInt`, `readString`, `readBoolean`, `readArray`, `readNull`, `readUndefined`, `readNullOrUndefined`. `readInt` fails with `TypeMismatch "Int"` unless `Int.fromNumber` succeeds. (Its README URL was a 404; I read `src/Foreign.purs` on `master`. I did not check whether the package was moved or deprecated.)

**Suggestion [inference].** Keep the tests untouched and compare in JavaScript on the returned value, sending it through `encodeJson` (or a `JSON.parse(JSON.stringify(...))` flattening) only when the signature says the result is a `Tuple`/`Maybe`. A raw `Tuple` must not be compared directly: it is a data type, so its JS shape is a compiler detail (I read no source stating it).

## 5. JS shapes with no natural PureScript type, and who is affected

| Shape | Natural PureScript type? | Puzzles |
|---|---|---:|
| `null` | `Maybe` | 0 |
| `undefined` | none (no JSON form; `Foreign` can detect it) | 0 |
| decimal numbers | `Number` | 0 |
| array of mixed element types | none for `Array`; `Tuple` for fixed pairs | 1 (`zip`) |
| nesting depth varying per test | `forall a. Array (Array a)` works, no single monomorphic type | 1 (`flatten`) |
| element type differing between tests | `forall a.` | 8 (includes `zip`, `flatten`) |
| arbitrary keys, one value type | `Object a` / `Map String a`, not a record | 7 |
| arbitrary keys, mixed value types | none: `Object Json` or `Foreign` | 4 |
| result type depends on the input (`getPath`) | none | 1 (in the 4 above) |

Totals: **31 plain, 7 needing `Object a`, 12 with no single plain type** (8 polymorphic + 4 mixed-object). `zip` and `flatten` are counted once, in the polymorphic 8.

## 6. Consequences for the spec (suggestions, not decisions)

1. The shared JSON tests can stay as they are for PureScript; none of null, undefined or decimals occurs.
2. Decide how the signature for the 12 awkward Puzzles looks to the player (`forall a.`, `Object Json`, or a per-Language signature, which ticket 04 already covers).
3. A Puzzle's `signature` is a JS-style call today (`chunk(items, size)`); a PureScript one would be a type, a Puzzle-file format question for ticket 04.
4. `zip` is the only Puzzle that forces a non-raw result (a `Tuple`, or a mixed two-item array typed `Array Json`).
5. Check the dictionary-argument question with a real compiler before relying on `unique` and `positions` being callable with plain arguments.

## Open items

- JS shape of `Maybe` and `Tuple` values at runtime: not stated in any source I read.
- Dictionary passing for constrained functions: unverified.
- `purescript-foreign` status (moved/deprecated): unchecked.
