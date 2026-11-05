Type: task
Status: ready-for-agent
Blocked by: 31

# 33: One browser smoke test for the PureScript check

## What to build

Ticket 21 left this out on purpose: one small test driving a real browser worker (see `research/11-browser-worker/drive.mjs`) so the browser and Node checks cannot drift apart.

## Acceptance

- Runs in a separate workflow (manual or on changes to the PureScript pieces), not in `deploy.yml`.
- Compiles one fixed Puzzle's Reference Solution in the browser worker and checks it passes; also checks one type error and one syntax error produce a non-empty message.
- The type-error message text is compared with puzzle-check's Node result, so drift between the two runners fails the test.
- Running every Reference Solution in the browser is out of scope (too slow).

## Comments

Decisions (owner, 2026-11-05): separate workflow, assertions as above. Still blocked by 31, so it cannot be built until the browser worker exists.
