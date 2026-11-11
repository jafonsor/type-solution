Type: task
Status: ready-for-agent

# 38: Warm up the first PureScript check

## What to build

Spec ("Check behaviour", "Where the build differs from the plan"): the first PureScript check after the page loads costs 0.3 to 0.4 s more than a later one (Prelude-only, Chrome: 584 ms against 143 ms), because the libraries are fetched, decoded and put in the compiler's tree on the first check. That wait counts toward the Run's time. Ticket 31 left the optional warm-up out, because the compiler worker runs synchronously and can only be killed on timeout, so a warm-up compile in flight could delay a real check by a compile (about 0.15 to 0.5 s).

Build a warm-up that makes the first real check as fast as a later one, without ever making a real check slower than it is today.

## Design room

Pick by measurement, in this order of preference:
1. **Preload only.** After the compiler loads, and when a new Puzzle opens, fetch the libraries the Puzzle's Reference Solution imports and build the compiler's tree, with no compile. Nothing is in flight inside the compiler, so nothing can delay a real check.
2. **Preload plus a warm-up compile**, only if (1) leaves the first check clearly slower than later ones, and only while no real check is queued or the player has not yet typed (a real check is due 400 ms after an edit).
Never touch a Puzzle's Reference Solution text in a way a player can see (it must not appear in the editor or the tooltip because of the warm-up).

## Acceptance

- The first real check after load is within about 50 ms of a later one for the same Solution, measured in Chrome and Firefox against a locally exported site (record the machine's load average).
- A real check started while a warm-up is running never takes longer than the same check without any warm-up; proven by a test that starts a check during a warm-up.
- The warm-up runs after load and when a new Puzzle opens, only for the Language that is current and only when its bundle is loaded; JavaScript-only players do nothing extra and request nothing under `purs/` (the existing driver checks this).
- Warm-up failures are silent (they never show in the status line); the real check still runs.
- Figures recorded in the spec.
