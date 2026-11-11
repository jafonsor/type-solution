# A static deploy with a lazy-loaded compiler bundle

The site stays static (GitHub Pages) and typed code never leaves the browser, for every Language. PureScript has no maintained browser compiler, so the PureScript compiler is shipped to the browser as a separate bundle. This follows from ADR 0002; the design is in `.scratch/other-languages/spec.md` (L1, "Build and shipping").

## Decision

- **Static deploy is a hard rule.** No server checks Solutions.
- **A separate bundle**, not part of the main one, with a content hash in every file name (GitHub Pages sets no cache headers), kept in Cache Storage and downloaded on the first pick of the Language (or at page load if it is the remembered one). Players who never pick PureScript pay nothing.
- **The port is the plan of record**, with no numeric gate: build, measure, then set limits. A patched `purescript` v0.15.16 on GHC 9.14's wasm backend has been built and run in a browser worker (about 2.3 MB brotli). The fallback, if later limits fail, is left open.
- **`purs-core.wasm` is built in its own repository, [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm), and shipped as a GitHub Release asset.** That repo holds the patch (applied to pinned upstream), the Nix recipe for the `gmp`-free GHC and the wasm, and a GitHub Actions workflow that builds and releases them. This repo fetches the released file with a pinned hash, so the app's `nix build` and `deploy.yml` never build GHC and stay the only pipeline for the site.

## Rejected alternative

- **A server-side checker.** It would need hosting, and bring cost, abuse, latency against the 400 ms check and typed code leaving the browser. It would also give up the static deploy.

## Consequences

- The compiler is built with a custom `gmp`-free GHC. That build lives in `purs-wasm`: about 1 h cold on a GitHub runner, cached after that. Developers who only run this app never build it; a developer who changes the compiler or its patch cuts a new release there and updates the pinned hash here.
- The released wasm is the source of truth. Rebuilding with a different GHC build gives different wasm bytes, so the release is not re-derived on every build here.
- No `gmp` licence note is needed for the bundle.
- The app's own wasm is unchanged (it still links `gmp`).
- Lazy loading means a wait on first PureScript pick, shown on the status line.
