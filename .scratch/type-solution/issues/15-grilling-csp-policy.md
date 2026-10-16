# Grilling: which CSP rules ship

Type: grilling
Status: resolved
Blocked by: 14

## Question

Which Content-Security-Policy does the page carry in its meta tag? [Research: do blob workers inherit a meta-tag CSP?](14-research-blob-worker-csp.md) found that `connect-src 'none'` can't cover the whole page, because the game fetches its own `frontend.wasm`, and left three candidates:

- `connect-src 'self'`: blocks the worker's cross-origin requests only.
- plus `script-src 'self' 'unsafe-eval' blob:`: also blocks `import()` from other sites.
- plus a second meta tag adding `connect-src 'none'` once the wasm has loaded: blocks same-origin requests too, but only if the game makes no network requests after it boots (unchecked; tested in Chrome only).

Decide which one ships, and whether a hands-on check in Safari (macOS and iPhone) and Firefox has to happen first or can wait until the game is live.

## Answer

None. The page carries no Content-Security-Policy, and the network block is out of scope.

- **Why:** every rule here only limits what a player's Solution can do, and that code runs only in the player's own browser, typed by them. Keep it simple: a Solution may do whatever its author wrote.
- **The worker stays as it is:** a fresh module worker per check, loaded from `js/runner.js`'s file address, killed after ~1 s or when a newer check starts. That is not about limiting the Solution: it stops an endless loop freezing the page and drops outdated checks.
- **Dropped:** the meta tag, starting the worker from a blob URL, and the Safari/Firefox checks.
- **Noted while grilling:** `connect-src 'self'` alone would not have been enough, since a module worker can send data out through `import("https://other.site/?data=…")`; moot now.

This replaces the CSP part of [Grilling: hosting and deployment](13-grilling-hosting.md).
