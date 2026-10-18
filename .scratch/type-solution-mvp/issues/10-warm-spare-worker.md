Status: ready-for-agent

# 10: Warm spare worker

## What to build

A check no longer waits for a test-runner worker to start: one worker is always started ahead of time, and each check takes it and starts the next spare.

## Acceptance criteria

- [ ] One spare test-runner worker is started when the page loads and after each check takes the previous one.
- [ ] Each check still uses a fresh worker (never one that already ran a Solution), terminated when its reply arrives, after ~1 s, or when a newer check replaces it.
- [ ] An endless loop still times out with "Stopped after 1.0 s: an infinite loop?", and the next check still works.
- [ ] The fizzBuzz Run still passes in `ob-run`.

## Blocked by

None (can start immediately).

## Notes for whoever implements it

- Decided in `.scratch/type-solution/issues/03-research-js-sandbox.md` (respawn took ~5–17 ms median in Chrome); `.scratch/type-solution/spec.md` lists it as decided but not built.
- The worker loads from the runner script's file address, not a blob URL (`.scratch/type-solution/issues/15-grilling-csp-policy.md`).
- A spare must never be reused after running a Solution: a fresh worker per check is what keeps one Solution's globals from leaking into the next check.
- Today the `Checker` in the frontend's JS seam holds the worker in flight; the spare fits beside it there. The worker protocol doesn't change.
