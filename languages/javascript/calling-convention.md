# JavaScript: calling convention

A test is a plain call: `fn(...args)` with `args` as the JSON values from the Puzzle file, in order. The result is compared with `expected` as JSON, object keys sorted, so a Solution's key order never matters in the result.

- The Solution defines a function named by the Puzzle's `function` (a declaration or a `const` arrow both work).
- Object arguments reach the Solution with their keys sorted, whatever order the file lists them in.
- Each check runs in a fresh worker with a 1 s timeout (`timeouts.runMs`); a throw fails that test with the error text.
- No imports: the runner offers only what the language itself provides.
