# Grilling: Puzzle file format

Type: grilling
Status: resolved

## Question

What does a Puzzle file contain and look like so coding agents can author them reliably? Cover the prompt, function name/signature and any starter code, test cases and how they're expressed, metadata (id, tags, difficulty if any), and the file type and repo location.

## Answer

**Contents.** A Puzzle is what `Common.Puzzle` already models, confirmed after playing the fizzBuzz demo:

- `function`: the name the Solution must define and the tests call.
- `signature`: shown as the heading, e.g. `fizzBuzz(n)`.
- `prompt`: one or two plain sentences.
- `tests`: a list of `{ args, expected }`, where both are JSON values (the test runner is JavaScript and compares results as JSON).
- `reference`: a working Solution, never shown to the player. A check runs every reference against its Puzzle's tests in Node, through the same test runner the browser uses, so an agent can't ship a Puzzle nobody can pass.

No starter code, tags or difficulty for now.

**File type: TOML**, one file per Puzzle. Chosen over JSON (no multi-line strings, so the reference would be one escaped line), YAML (silent type conversions like `no` → `false`) and Markdown (we'd write our own parser). Prompt and reference use multi-line strings; each test is a `[[tests]]` block:

```toml
function = "fizzBuzz"
signature = "fizzBuzz(n)"
prompt = """
Return "Fizz" for multiples of 3, "Buzz" for multiples of 5,
"FizzBuzz" for both, otherwise the number as a string."""

reference = '''
function fizzBuzz(n) {
  if (n % 15 === 0) return "FizzBuzz";
  if (n % 3 === 0) return "Fizz";
  if (n % 5 === 0) return "Buzz";
  return String(n);
}
'''

[[tests]]
args = [3]
expected = "Fizz"
```

TOML has no `null`, so no Puzzle takes or returns `null` (JSON has no `undefined` either). Large nested values must fit an inline table on one line; rare for these Puzzles.

**Identity: the file name.** `fizzBuzz.toml` is the Puzzle `fizzBuzz`; a Run records the file name, not the function name. The file sets the function name itself, so two Puzzles may share one. Naming the file after the function is only a guideline for the agents that write Puzzles. (fizzBuzz's Runs already stored keep matching, since both names are `fizzBuzz`.)

**Location: a top-level `puzzles/` folder, read into the app at compile time** (Template Haskell). Checked: the project's wasm32-wasi-ghc 9.14 runs a splice that reads a `.toml` file and embeds its text (tested on a throwaway module, not the full app build). A broken file breaks the build; adding a Puzzle means a rebuild.

**Left to the build:** parse the TOML in the splice (preferred: errors become build errors) or embed the text and parse at startup; confirm `toml-parser` (pure Haskell, TOML 1.0) is in the pinned package index.
