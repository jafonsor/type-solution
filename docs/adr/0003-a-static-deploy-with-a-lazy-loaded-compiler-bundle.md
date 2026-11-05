# A static deploy with a lazy-loaded compiler bundle

The site stays static (GitHub Pages) and typed code never leaves the browser, for every Language. PureScript has no maintained browser compiler, so the PureScript compiler is shipped to the browser as a separate bundle. This follows from ADR 0002; the design is in `.scratch/other-languages/spec.md` (L1, "Build and shipping").

## Decision

- **Static deploy is a hard rule.** No server checks Solutions.
- **A separate bundle**, not part of the main one, with a content hash in every file name (GitHub Pages sets no cache headers), kept in Cache Storage and downloaded on the first pick of the Language (or at page load if it is the remembered one). Players who never pick PureScript pay nothing.
- **The port is the plan of record**, with no numeric gate: build, measure, then set limits. A patched `purescript` v0.15.16 on GHC 9.14's wasm backend has been built and run in a browser worker (about 2.3 MB brotli). The fallback, if later limits fail, is left open.
- **The bundle is built in the app's own `nix build`**, from a patch file in this repo applied to pinned upstream, so local and CI builds use the same command and the existing `deploy.yml` stays the only pipeline.

## Rejected alternative

- **A server-side checker.** It would need hosting, and bring cost, abuse, latency against the 400 ms check and typed code leaving the browser. It would also give up the static deploy.

## Consequences

- The compiler bundle is built with a custom `gmp`-free GHC that the repo must build and cache: about 34 minutes cold, so CI must cache it. Packaging it in Nix and building it on Linux CI are not yet proven.
- No `gmp` licence note is needed for the bundle.
- The app's own wasm is unchanged (it still links `gmp`).
- Lazy loading means a wait on first PureScript pick, shown on the status line.
