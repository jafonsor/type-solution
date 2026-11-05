Type: task
Status: needs-triage
Blocked by: 31

# 33: One browser smoke test for the PureScript check

## What to build

Ticket 21 left this out on purpose: one small test driving a real browser worker (see `research/11-browser-worker/drive.mjs`) so the browser and Node checks cannot drift apart.

## Acceptance

- Runs in CI or documented as manual.
