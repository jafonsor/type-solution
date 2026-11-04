Type: task
Status: resolved
Blocked by: none

# 14: Build a `native` (no gmp) wasm GHC 9.14 from source and rebuild purs-core with it

## Question

Per the user, after [ticket 10](10-task-build-purs-wasm.md): no `native` flavour exists for macOS arm64, so build GHC's wasm backend from the `haskell-wasm/ghc` fork (`ghc-9.14` branch) with the native bignum backend instead of in-tree gmp, following the ghc-wasm-meta README "building guide" (wasi-sdk fork, libffi-wasm, env vars, `./configure`, hadrian). Then rebuild `purs-core` with it and confirm it links no `gmp`.

Record, as the answer: the exact recipe that worked, wall-clock build time and peak memory, whether `purs-core` builds unchanged and gives the same results and size as in ticket 10, and whether `gmp` symbols are really gone (also check the app's own wasm for them). Feeds [ticket 13](13-grilling-compiler-bundle-build-and-deploy.md).

Heavy on CPU and memory: limit hadrian jobs (this machine ran out of memory before; see `.envrc`).

## Progress notes

## Answer

**Plain version: it worked.** I built a GHC 9.14 wasm toolchain from source on this Mac with the `native` bignum backend (no `gmp`), rebuilt the PureScript compiler with it, and got the same results with no `gmp` inside. So ticket 13 can take the licence concern off the table, for the compiler bundle and, if you rebuild it the same way, for the app.

**What was built.** The `ghc-9.14` branch of `gitlab.haskell.org/haskell-wasm/ghc` (revision 8c11f105), version 9.14.1.20261012, in `~/devs/ghc-wasm-native` (clone 391 MB; not in the repo). Installed to `~/devs/ghc-wasm-native/inst`. Scripts: [ghc-native-build.sh](../research/10-purs-wasm/ghc-native-build.sh), [ghc-native-install.md](../research/10-purs-wasm/ghc-native-install.md), [purs-core-build-with-native-ghc.sh](../research/10-purs-wasm/purs-core-build-with-native-ghc.sh).

**Cost.** Hadrian build: 34 min on 10 cores with 4 jobs, 32 GB RAM, no memory trouble. Rebuilding `purs-core` and all its dependencies with it: about 9 minutes. Two earlier hadrian attempts failed, see below.

**What had to be done differently from the README recipe.**
- Flavour `perf+native_bignum`, and `./configure --target=wasm32-wasi --with-system-libffi` without `--with-intree-gmp`.
- Bootstrap with the plain GHC 9.14.1 from Nix, not the shell's package-environment GHC. With the latter, hadrian's `ghc-pkg` saw every boot package twice (global DB plus in-tree) and died with "Couldn't parse depends:". The first failure also showed a harmless `getProcessGroupIDOf: No such process` race; the retry used `-j4`.
- The bindist installs with `--build/--host` set to the Mac and the wasi-sdk tools as the target compilers (the `ghc-wasm-meta` Nix recipe does the same), plus `RelocatableBuild=YES`.
- Packages need `-optc-Wno-error=int-conversion` (clang 21 makes `clock`'s generated C fail otherwise).

**Results** (same patched `purescript` v0.15.16 and `purs-core`, no source changes):

| | 9.14 `gmp` (ticket 10) | 9.14 `native` |
|---|---|---|
| wasm raw / gzip / brotli | 23.85 / 3.53 / 2.33 MB | 23.63 / 3.46 / 2.28 MB |
| `gmp` in the binary | 134 mentions, `integer_gmp_*` functions | 2 mentions, both unrelated symbol names |
| cold build, Prelude + Main | 3.35 s | 3.36 s |
| one-module re-check | 0.34 to 0.46 s | 0.46 s (same range) |
| unchanged re-check | 0.25 s | 0.26 s |
| compiled output | | byte-identical to the `gmp` build (same `externs.cbor` and JS files) |

A hello world computing 2^200 gives the right answer on the `native` toolchain. The compiler's speed shows no cost from native bignum, as expected since it does little big-number work.

**The app's own wasm.** The repo's built `frontend.wasm` does contain `gmp`: 130 mentions and 13 `integer_gmp` functions in the dev build (`dist-wasm/frontend.jsexe/frontend.wasm`), and 4 `integer_gmp` functions even in the optimised store build. So the app already ships `gmp`; the compiler bundle would be a second file with the same obligation unless one or both are rebuilt with this `native` toolchain.

**Not done.** Running the `native`-built compiler in a browser (still [ticket 11](../issues/11-task-purs-wasm-in-browser-worker.md)); rebuilding the real Obelisk app with it (see the follow-up below); Nix-packaging the GHC build; building on Linux CI. A `native` build from the `master` branch (what ghc-wasm-meta's `native` flavour tracks) was not tried; this is the 9.14 release branch with native bignum.


## Follow-up: the app's frontend built with only this `native` GHC

Done after the main answer, on `prototype-reflex-wasm/` (the Obelisk-free reflex-dom frontend), not on the real app.

- **Result.** It builds and renders in headless Chrome 148 with output identical to the nix-bindist build (heading, "Clicks: 0", echo and length, toggle). `frontend.wasm` (dev `-O1`, 7.56 MB raw) has no `integer_gmp` references. Clicking, `--prod` (`wasm-opt`, `wasm-tools strip`) and size comparison were not done.
- **Two things were needed at install time, not build time.** The first attempt failed building reflex-dom-core: "size 10592929 > maximum function size 7654321" while loading the Template Haskell shared library. (1) My first install ran the bindist's `configure` without the `CONF_*_STAGE2` flag variables, so `lib/settings` had plain flags (`ghc-wasm-meta` exports them in its wasi-sdk setup hook). (2) Even with them, the link flags lacked `-fuse-ld=<wasi-sdk>/bin/wasm-ld`: without it clang picks a plain LLVM `wasm-ld` that lacks the haskell-wasm patch splitting the oversized function. [ghc-native-install.sh](../research/10-purs-wasm/ghc-native-install.sh) now does both, and the installed `settings` matches the nix bindist's (checked by diff). A fresh install, a fresh cabal store and a clean app build then gave the same working page. Which of the compiler flags matters beyond `-fuse-ld` was not tested. No Hadrian rebuild was needed: `build3.sh` already exported the variables.
- **How.** [app-frontend-build-with-native-ghc.sh](../research/10-purs-wasm/app-frontend-build-with-native-ghc.sh): plain cabal with this GHC, a fresh cabal dir and builddir (`dist-native2`), then the assembly steps of the prototype's `build.sh`. Its paths point at nix-store tools (node, wasi-sdk) and a scratchpad `ghc-pkg` shim.
- **Not tried.** The real app (`frontend/`, `common/`), whose Obelisk libraries come from nix.
