Type: grilling
Status: resolved
Blocked by: none

# 13: How is the PureScript compiler bundle built, pinned and shipped?

## Question

From [ticket 10](10-task-build-purs-wasm.md): the bundle is a patched `purescript` v0.15.16 built on GHC 9.14 wasm (the 9.8 and `native` flavours are not available on macOS arm64), about 2.3 MB brotli plus about 47 KB of Prelude externs, statically linking `gmp` (LGPL). Decide: where the patches live (a fork, a patch file in this repo, a Nix derivation); how the bundle is built reproducibly (Nix, CI) and fingerprinted; how it is served from GitHub Pages and cached (per [ticket 06](06-grilling-checking-without-browser-compiler.md)); what it does to the CSP; the externs set per Puzzle library; and what the `gmp` licence needs. Whether 9.14 behaviour drift against `purs`'s 9.8 pins is acceptable.

Update from [ticket 14](14-task-build-native-wasm-ghc.md): a `native` (no `gmp`) GHC 9.14 builds from source on this Mac in 34 minutes and builds the same `purs-core` with identical output. The `gmp` question is now a choice: keep the prebuilt `gmp` toolchain (the app's wasm already contains `gmp`) or maintain the `native` build for the compiler bundle and, optionally, the app. Decide with the cost of owning a GHC build in this repo's Nix setup.

## Answer

Resolved with the user, 2026-10-29.

- **A Nix package in the app's own build.** `nix build` builds the compiler bundle (`purs-core.wasm` plus externs) as one more package, and reuses it from the cache when its inputs are unchanged. Local and CI use the same command; the existing `deploy.yml` (with its Nix cache) is the only pipeline. If a cold CI build proves too slow, a separate workflow is the fallback, decided then.
- **Patches: a patch file in this repo**, applied to the pinned upstream `purescript` v0.15.16 (no fork). Starting point: [purescript.patch](../../../nix/purescript/purescript.patch) and the entry point in [research 10](../research/10-purs-wasm/).
- **Toolchain: the repo's existing wasm GHC (9.14, with `gmp`)**, the same one `project.nix` already uses. Not the `native` build from [ticket 14](14-task-build-native-wasm-ghc.md): owning a GHC build costs far more than a licence note, and the app's wasm already contains `gmp`. A short `gmp` (LGPL) note ships beside the bundle. Revisit only if the licence is objected to.
- **9.14 drift:** accepted, with puzzle-check compiling every PureScript Reference Solution with the wasm compiler and failing on any error. This is also the Reference Solution check for PureScript.
- **Libraries:** a committed list of PureScript libraries is the source of truth (its location goes in the spec, next to the Language table of [ticket 04](04-grilling-puzzle-file-per-language.md)), with one pinned PureScript package-set release named in it so all versions are fixed together. A script may suggest additions from the Reference Solutions' imports; puzzle-check fails if a Reference Solution imports a library not on the list. The Nix package builds externs for exactly that list, and the auto-import names ([ticket 08](08-prototype-auto-import.md)) come from it.
- **Serving and caching:** GitHub Pages sets no cache headers, so every bundle file has a content hash in its name (the Nix output hash) and the browser keeps the bytes in Cache Storage; old versions are deleted when a new one is stored.
- **When it downloads:** on the first PureScript pick, or at page load if PureScript is the remembered Language. JavaScript-only players pay nothing. A hashed manifest maps each library to its externs file; a library's externs are fetched only when a Solution imports it.
- **CSP:** no change; the page has none ([ticket 15 of the MVP map](../type-solution/issues/15-grilling-csp-policy.md)).
- **Noted:** the built `purs-core.wasm` has no backup beyond the untracked worktree `.claude/worktrees/research-purs-browser-port/`; the Nix package makes it rebuildable from the patch.

## Amendment (2026-11-04)

The player reversed the toolchain bullet: use the `native` (no `gmp`) wasm GHC 9.14 from [ticket 14](14-task-build-native-wasm-ghc.md) for the compiler bundle, not the repo's existing `gmp` one. No `gmp` licence note is needed for the bundle. The cost of owning that GHC build (Nix packaging, Linux CI, caching, about 34 min cold) is accepted and recorded in the handoff spec. The app's own wasm still contains `gmp`. All other decisions above stand.

**Plan for the `gmp`-free GHC (2026-11-04).** A Nix derivation with all inputs pinned is the packaging; the risk is only that it builds in Nix's closed box (no network) and on GitHub's x86 Linux runners, not the owner's ARM Mac. Intended order: (1) write the derivation, likely adapting the `ghc-wasm-meta` Nix recipe that ticket 14 followed; (2) build it in Docker with `--platform linux/amd64` (Docker Desktop with Rosetta is already on, and an x86 container was checked to run), capping CPU, memory and disk to the runner's; (3) confirm in a real GitHub Actions run and check the result is cached between runs. Docker cannot prove caching or exact runner limits, and GHC may not run under Rosetta; if so, skip to step 3. Runner specs and cache-size limits are not yet looked up. Recorded in the handoff spec's build step 3.
