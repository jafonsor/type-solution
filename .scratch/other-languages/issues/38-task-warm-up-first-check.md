Type: task
Status: resolved

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

- [x] The first real check after load is within about 50 ms of a later one for the same Solution, measured in Chrome and Firefox against a locally exported site (record the machine's load average).
- [x] A real check started while a warm-up is running never takes longer than the same check without any warm-up; proven by a test that starts a check during a warm-up.
- [x] The warm-up runs after load and when a new Puzzle opens, only for the Language that is current and only when its bundle is loaded; JavaScript-only players do nothing extra and request nothing under `purs/` (the existing driver checks this).
- [x] Warm-up failures are silent (they never show in the status line); the real check still runs.
- [x] Figures recorded in the spec.

## Comments

Built 2026-11-11 on branch `purescript-warm-up`. Design: preload alone was tried first and left Chrome's first check 143 to 189 ms over a later one (Prelude only 304 against 161), so a throwaway compile was added, in a separate worker that is terminated when a real check starts (the one place the ticket's "never delay a real check" is kept: a compile cannot be interrupted, so it is not run in the worker real checks use). Figures and mechanism: spec, "Warm-up (ticket 38)" under Check behaviour, and "Where the build differs from the plan".

- **Within about 50 ms**: Chrome 18, 40, 36 and 32 ms over a later check (Prelude only, `import Data.Array`, `chunk`, `queryString`); Firefox 10, 26, 17 and 9 ms. Machine load average 4.8 to 6.6 (not quiet) beside every figure in the spec. Mechanism: `check.mjs` `warmUp` (preload plus throwaway compile); proof: `measure-purescript.mjs` with `WARM=ready|preload`.
- **A check started mid-warm-up is never slower**: unit tests in `static/editor/test/purescript-check.test.mjs` ("a real check started while the throwaway compile runs kills it at once and gets exactly what it gets without a warm-up", "...still fetching...", "...never starts while a check is in flight..."); the real compiler in `tools/purs-bundle/test/browser-checker.test.mjs`; measured with `WARM=during DURING_MS=150`: medians 616 against 731 ms (Chrome, 16 each), 381 against 445 (Firefox, 12 each); one Firefox sample of twelve (605) was slower than any without, at load 14. Not proven on a machine with one or two cores.
- **Only the Language shown, only when loaded, JavaScript does nothing**: `canWarmUp` on the Language (PureScript only), asked by the page before a Checker is made; `loader.whenLoaded()` never starts the download; `drive-purescript.mjs` sections 1 and 6 (no request under `purs/` and no compiler worker for a JavaScript-only page, also after new Puzzles; libraries fetched at load, for new Puzzles and after picking PureScript, with no typing).
- **Silent**: every warm-up step is inside a catch; the Run, status line and editor are never given anything (driver section 6 checks the editor, status line and stored runs).
- **Needed a Haskell edit** (`Frontend/Run.hs`, `Frontend/Js.hs`: the page hands the Reference Solution to the Checker; it is the only place that knows the Puzzle). The text stays in the JavaScript Checker.

Gates (2026-11-11): `npm test --prefix static/editor` 151/151; `npm test --prefix tools/puzzle-check` 79/79; `npm test --prefix tools/purs-bundle` 38/38 (with `PURS_WASM`, `PURS_LIBS`); `npm run check --prefix tools/puzzle-check` all 50 pass; `npm run solutions --prefix tools/puzzle-check -- --lang=purescript` 50 of 50; `nix build` and `nix build .#checks.aarch64-darwin.common-test` pass (Haskell touched: the native and wasm `frontend` libraries compiled `Frontend.Js` and `Frontend.Run` with no GHC warning in the log); `cabal build lib:common lib:frontend -f strict --ghc-options=-fforce-recomp` passes; real Chrome drivers on a fresh export: drive-language 28/28, drive-saved-data 20/20, drive-imports 38/38 (Chrome) and 38/38 (Firefox), drive-purescript 52/52 (six new checks for the warm-up; the check that a reload asks only for the pointer now also allows the warm-up's library packs), smoke-purescript 7/7, drive-site passes. Broken on purpose and seen to fail: the throwaway worker not killed by `stop()` (2 tests), the idle guard dropped (1), a preload counted as held before the worker said so (1), `warming` not bumped (1), `canWarmUp` on JavaScript (1), and the exported shim with `canWarmUp` never true (driver section 6: 4 checks fail). A `RangeError: Field is not present in this state` on a blur in drive-purescript section 5 appears on the ticket 33 export too (not from this ticket).
