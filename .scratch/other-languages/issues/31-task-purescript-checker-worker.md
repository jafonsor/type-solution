Type: task
Status: ready-for-agent
Blocked by: 26, 28

# 31: PureScript Checker worker, errors and loading line

## What to build

Build order step 5. One long-lived compiler worker with a fresh instance per check on a persistent in-memory tree (the browser twin of ticket 21's runner; harness in `research/11-browser-worker/`, including the modified-time fix), ~5 s compile timeout, status-line and underline errors, syntax errors underlined at the end of the last non-blank line before the reported position, loading line, optional warm-up compile.

## Acceptance

- A type error and a syntax error show readable messages with underline; a passing Solution runs against the tests in a fresh sandbox with the ~1 s timeout.
