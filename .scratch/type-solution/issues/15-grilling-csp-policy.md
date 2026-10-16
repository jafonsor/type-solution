# Grilling: which CSP rules ship

Type: grilling
Status: open
Blocked by: 14

## Question

Which Content-Security-Policy does the page carry in its meta tag? [Research: do blob workers inherit a meta-tag CSP?](14-research-blob-worker-csp.md) found that `connect-src 'none'` can't cover the whole page, because the game fetches its own `frontend.wasm`, and left three candidates:

- `connect-src 'self'`: blocks the worker's cross-origin requests only.
- plus `script-src 'self' 'unsafe-eval' blob:`: also blocks `import()` from other sites.
- plus a second meta tag adding `connect-src 'none'` once the wasm has loaded: blocks same-origin requests too, but only if the game makes no network requests after it boots (unchecked; tested in Chrome only).

Decide which one ships, and whether a hands-on check in Safari (macOS and iPhone) and Firefox has to happen first or can wait until the game is live.
