# Grilling: Puzzle file format

Type: grilling
Status: open

## Question

What does a Puzzle file contain and look like so coding agents can author them reliably? Cover the prompt, function name/signature and any starter code, test cases and how they're expressed, metadata (id, tags, difficulty if any), and the file type and repo location.

## Answer (partial)

**Contents: settled.** A Puzzle is what `Common.Puzzle` already models, confirmed after playing the fizzBuzz demo:

- `function`: the name the Solution must define and the tests call.
- `signature`: shown as the heading, e.g. `fizzBuzz(n)`.
- `prompt`: one or two plain sentences.
- `tests`: a list of `{ args, expected }`, where both are JSON values (the test runner is JavaScript and compares results as JSON).

No starter code, and no id, tags or difficulty for now: the function name identifies the Puzzle.

**Still open:** the file type and where the files live in the repo, decided when the bank grows past fizzBuzz.
