Type: task
Status: resolved
Blocked by: 22

# 26: Move JavaScript behind the four seams

## What to build

Spec "Languages": Checker, Editor mode, Import rules, bank folder. Refactor the current JavaScript check (acorn parse, fresh worker per check, ~1 s timeout, spare worker) behind a Language interface so PureScript is a second implementation, never a second code path.

## Acceptance

- [x] No behaviour change for JavaScript players; existing tests pass.
- [x] A Language is a value with the four seams; the run and the UI take the current Language as an argument.
