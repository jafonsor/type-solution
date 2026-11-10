Type: task
Status: ready-for-agent
Blocked by: 26, 28, 35 (its calling-convention rule must be mirrored), 37 (the bundle must be published with the site)

# 31: PureScript Checker worker, errors and loading line

## What to build

Build order step 5. One long-lived compiler worker with a fresh instance per check on a persistent in-memory tree (the browser twin of ticket 21's runner; harness in `research/11-browser-worker/`, including the modified-time fix), ~5 s compile timeout, status-line and underline errors, syntax errors underlined at the end of the last non-blank line before the reported position, loading line, optional warm-up compile.

## Acceptance

- A type error and a syntax error show readable messages with underline; a passing Solution runs against the tests in a fresh sandbox with the ~1 s timeout.

## Comments

Ticket 35: the worker must mirror the typed path of `tools/puzzle-check/purs-runner.js` (spec, "Calling convention"). When the signature has a constraint other than `Eq` or a row-solved one (`Union`, `Nub`, `Lacks`, `Cons`, `Append`), generate a `Harness` module with one function per test, `t<i> _ = f <literals typed from the test's JSON>`, compile it with the Solution in the same compiler run, and call `t<i>()` instead of building dictionaries by hand. Same JSON-to-type mapping and same readable failures. Measure the added cost in the browser (in Node it was not measurable).

Owner (2026-11-10): ticket 28 measured a check with `import Data.Array` at about 0.56 s warm in Chrome (0.37 s in Firefox) on a machine under heavy load, against the 400 ms target. Re-measure on a quiet machine with the real worker and report if still clearly slow; no limit is decided yet. Pass the compiler only the reachable sources (`sourcesFor` in `static/bundle/purs-tree.mjs`).
