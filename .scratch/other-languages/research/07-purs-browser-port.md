# Research: Can purs be built for the browser?

Ticket: [07-research-purs-browser-port](../issues/07-research-purs-browser-port.md). Researched 2026-10-27. Primary sources: the GHC user guide (`docs/users_guide/wasm.rst`, `javascript.rst`, master), the `ghc-wasm-meta` README, `purescript/purescript` at tag v0.15.16 (cabal file and source), `purescript/trypurescript` server source, Hackage, the `cborg` repo, and the repos of other Haskell programs running on GHC's wasm backend. One time-boxed build attempt (about 20 minutes of build effort, on throwaway branch `research/purs-browser-port`, worktree `.claude/worktrees/research-purs-browser-port`; nothing committed, the `type-solution-mvp` working tree untouched).

## Plain-language answer

**Feasible with caveats. It is a real porting project, not a flag you flip, and I could not finish it in the time box.**

- The building blocks exist today. GHC can produce WebAssembly (the same toolchain this repo already uses for the app), supports Template Haskell on it, and at least two compiler-sized Haskell programs already run in a browser or a WASI runtime that way (Agda, and GHC itself).
- `purs` as shipped will not build as is: it needs a handful of old libraries (`basement`, `network`, `process`, `haskeline`, a pinned old `happy`) that do not work on WebAssembly. But those sit around the edges (command line, a language server, file caching), not in the type checker. The part we need (check one `Main` module against already-checked libraries, get JavaScript) is a small in-memory pipeline that Try PureScript's own server already shows how to drive.
- My build attempt got through the dependency solver and compiled several dependencies, and stopped on a short, specific list of blockers (below). None looked unfixable; none was fixed for the real compiler. **I did not get `purs` itself compiled, so every figure about size, start-up, memory and check time is unmeasured.**

## 1. State of GHC's WebAssembly and JavaScript backends

**WebAssembly (`wasm32-wasi`)**
- Still described as a "tech preview"; needs a custom GHC build, not stock ghcup GHC. It is a cross compiler (`wasm32-wasi-ghc`), and output uses WASI, which browsers get from a JS shim. [GHC user guide, wasm.rst](https://gitlab.haskell.org/ghc/ghc/-/blob/master/docs/users_guide/wasm.rst)
- Flavours tracking GHC 9.6, 9.8, 9.10, 9.12 and 9.14 are published; the default is 9.14. [ghc-wasm-meta README](https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta). This repo already builds with 9.14 and a 9.12 bindist (see `project.nix`). The local compiler reports 9.14.1.20260731.
- **Template Haskell works**: it runs through an external interpreter that needs a recent `node` on `PATH` at build time; it also supports GHCi. (wasm.rst, "Using GHCi with the wasm backend".) Local `node` is v24.17.0.
- **Single-threaded runtime** ("we're using the single-threaded runtime at the moment", wasm.rst, JSFFI section). `purs` links with `-threaded -N` and `parallel`/`lifted-async`/`stm`; those compile but would run sequentially.
- A browser build is a WASI "reactor" module with exports plus JS FFI; the repo's own app does this. For a worker, use a JS WASI shim (`browser_wasi_shim`); this is what ormolu-live does (see section 5).
- Target is 32-bit (`Int` is 32-bit). This matters: old libraries that special-case 32-bit platforms break (cborg, basement below).

**JavaScript backend**
- C code in dependencies cannot just be compiled; each C FFI import needs a replacement written in JS ("jsbits") or removed with CPP. [javascript.rst, "Writing Replacement Implementations for Libraries with C FFI Functions"](https://gitlab.haskell.org/ghc/ghc/-/blob/master/docs/users_guide/javascript.rst). `purs` reaches C code through `basement`, `crypton`, `zlib`, `network`, `cborg` and others. The wasm backend links C normally (wasi-sdk clang), so **wasm is the lower-risk route**. I did not test the JS backend. The repo's earlier size note found JS output smaller but that was for a reflex app, not for this.

## 2. Can the repo's Haskell-to-WASM build be reused?

The toolchain, yes; the build recipe, partly.
- The dev shell already puts `wasm32-wasi-ghc`, `wasm32-wasi-cabal` and a wasm clang on `PATH`. Used directly with an isolated `CABAL_DIR`, the solver found a plan for `purs` with GHC 9.14 (with `allow-newer: all`).
- **Version mismatch is the first caveat.** `purescript.cabal` pins `base >=4.19.2.0 && <4.20` (GHC 9.8) and narrow ranges on about 60 packages, with a comment that the pins are deliberate because dependency changes alter compiler behaviour. [purescript.cabal at v0.15.16](https://github.com/purescript/purescript/blob/v0.15.16/purescript.cabal). Building with 9.14 means overriding all of that and risking behaviour drift (for example `language-javascript` was solved to 0.7.1.0, although the cabal file says it "should always be pinned to a single specific version" 0.7.0.0). A faithful port would use the **9.8 wasm flavour** that `ghc-wasm-meta` offers (not installed here; not tried). That would need a separate toolchain download.
- `v0.15.16` is not on Hackage (latest is 0.15.15); I built from the git tag.
- Nix packaging for the port is not done; the attempt used plain cabal.

## 3. Time-boxed build attempt: what happened

Command shape: `cabal --with-compiler=wasm32-wasi-ghc --with-hc-pkg=wasm32-wasi-ghc-pkg ... build lib:purescript --keep-going`, GHC 9.14.1, from the v0.15.16 tag. Each build round failed fast, so the full effort was short but each round hit the next layer.

| Blocker | What fails | Cause | Fix seen / needed |
|---|---|---|---|
| `basement-0.0.16` (via `memory`, `crypton`) | C header: `#error "foundation: system: Unknown compiler"`; then `GHC.IntWord64` module missing in `Basement/Numerical/Conversion.hs` | Unmaintained; no WASI case, and 32-bit code paths use a module removed from base | Not fixed. `purs` uses `crypton`/`memory` only in `Language/PureScript/Make/Cache.hs` (SHA-512 file hashes for incremental builds), so the port can **drop that module's hashing** rather than port the packages. Unverified: whether other transitive users remain. |
| `network-3.2.9.0` | `getaddrinfo`, `getnameinfo`, `freeaddrinfo` undeclared (WASI has no sockets) | Required through `fast-logger` (via `monad-logger`) even for the library; the `purs ide` server also imports `Network.Socket` (`app/Command/Ide.hs`) | Not fixed. Needs replacing `monad-logger`'s logger, or a stub. |
| `cborg-0.2.10.0` (Hackage release) | `Couldn't match expected type 'Word#' with actual type 'Word64#'`; missing `GHC.IntWord64` | 32-bit target | **Fixed by using cborg git master** (merge `palas-wasm-fix`, 2026-05-13, "Disable threading for wasm32", plus GHC 9.14 support). The library then compiled. It is not on Hackage yet, so the port needs a pinned git dependency. The externs files are CBOR, so this matters. |
| `cheapskate-0.1.1.2` | `guard`, `replicateM`, `unless` not in scope | Needs `Control.Monad` imports; new base no longer re-exports them via the modules it used | **Fixed** by adding `import Control.Monad`. A 9.14 issue, would not occur on 9.8. |
| `happy-2.0.2` (build tool for `CST/Parser.y`) | cabal builds the tool for wasm (cannot run it) and it also clashes with newer `happy-lib` | Cabal does not distinguish host and target for build tools | **Worked around**: built `happy 2.0.2` natively, generated `Parser.hs` by hand, removed `build-tool-depends`. |
| `process`, `haskeline`, `directory`, `Glob` | Not reached; the build stopped earlier | `process` has no fork on WASI; the REPL and publish code use it (`Language/PureScript/Publish.hs`, `Interactive/IO.hs`) | Unverified. Core modules use `directory`/`filepath` in 14 files; WASI can supply a virtual filesystem, but I did not test. The port can exclude REPL/publish/ide. |
| Template Haskell | Not reached | `TemplateHaskell` is used in ~10 modules (lenses, constants, `file-embed` for docs CSS) | Expected to work (supported on wasm, and reflex-dom used it in this repo's own build), but unverified for `purs`. |

Not reached, so unknown: whether the ~200 modules of `purescript` compile at all on wasm32 with GHC 9.14, how long they take, and whether anything else (memory use on a 4 GiB limit at compile time, `-threaded` flags) bites.

Build artefacts, patches and logs are only in the throwaway worktree (`.scratch/other-languages/research/purs-build/` in `.claude/worktrees/research-purs-browser-port`, untracked). Nothing was committed.

## 4. Size, start-up, memory, per-check time

**Not measured. No `purs` wasm module was produced.** What I can say from primary sources:
- Native `purs` release bundles are 10.5 to 23 MB gzipped ([research 01](01-purescript-in-browser.md), section 1). A wasm build is not guaranteed smaller; the repo's earlier note puts a trivial reflex wasm at 5.5 MB raw / 0.96 MB brotli, and a compiler is orders of magnitude more code. **Order-of-magnitude expectation only, unverified: tens of MB raw, roughly 5 to 15 MB brotli.** That is much bigger than the app and has to be a separate, lazily fetched bundle (as ticket 06 already decided).
- A GHC-in-browser demo downloads about 50 MB (a rootfs tarball) and freezes the page for several seconds while it unpacks (author's report, [Discourse thread](https://discourse.haskell.org/t/ghc-now-runs-in-your-browser/13169)). That is the closest figure for "a compiler-sized wasm program in a browser", but it includes the whole of GHC's library tree.
- Agda on wasm (GHC 9.8) needs the RTS option `-V1`, because the default "suffers from thrashing" (timer-related) ([agda-wasm-dist README](https://github.com/agda-web/agda-wasm-dist)). A hint that RTS settings need tuning, and that wasm timing is a known gotcha.
- Check time for one small `Main` module: nothing published, nothing measured. What the work consists of is known: [Try PureScript's server](https://github.com/purescript/trypurescript/blob/master/server/Main.hs) keeps all library externs in memory and rebuilds one module per request (`Make.rebuildModule'`), the same design a browser build would use; its cost is paid at start-up (decoding externs) rather than per check.

## 5. Can the compiler's input (externs) ship as static files?

Yes in principle; size unmeasured.
- `purs compile` writes `output/<Module>/externs.cbor` per module ([`Language.PureScript.Make`](https://github.com/purescript/purescript/blob/v0.15.16/src/Language/PureScript/Make.hs), `externsFileName` in `Externs.hs`). They are CBOR (the `cborg`/`serialise` packages), which is why the cborg wasm32 fix matters. Plain static files, one per module, fingerprintable and cacheable as ticket 06 wants.
- The compile entry point is not tied to files: `MakeActions` is a record of functions, and Try PureScript's server supplies `readExterns = pure ("<file>", Nothing)` and an in-memory `codegen`, then calls `Make.rebuildModule'` with a list of `ExternsFile` values and the names environment. So a wasm `purs-core` executable could take externs as bytes from JS, with no filesystem or process access. Try's server depends only on `purescript` plus web-server packages ([trypurescript.cabal](https://github.com/purescript/trypurescript/blob/master/trypurescript.cabal)); a browser variant would depend on `purescript` alone.
- Try itself builds its externs at server start by compiling all library sources, not by reading `externs.cbor`; reading them (via the same `Externs` decoder `purs ide` uses) is the route a port would take.
- **Size of the externs for `Prelude` and typical libraries: not measured** (I had no working `purs` to produce them, and the earlier sandbox refused to run a downloaded binary). Unverified. The compiler also needs the module environment built from them at start-up; time unknown.

## 6. Prior art for porting a Haskell compiler or checker

| Project | What it shows | Source |
|---|---|---|
| **Agda to wasm** (GHC 9.8.1, 9.10, 9.10.2) | A large, dependently typed Haskell checker built to `wasm32-wasi`. Needs a patch (about 8 KB; touches `Agda.cabal`, `AgdaTop.hs`, setup code) and run via wasmer, not in a browser page, though an Observable demo exists. Closest analogue to `purs`. | [agda-web/agda-wasm-dist](https://github.com/agda-web/agda-wasm-dist) (last push 2026-04-04); [formalverification/agda-wasm-builds](https://github.com/formalverification/agda-wasm-builds) (2026-10-08) |
| **GHC itself in the browser** | The GHC library (parse, typecheck, desugar) runs client-side on the wasm backend; bytecode interpreter only; no `cabal` (no processes); about 50 MB download. | [Discourse, 2025-10-25](https://discourse.haskell.org/t/ghc-now-runs-in-your-browser/13169), [haskell-wasm/ghc-in-browser](https://github.com/haskell-wasm/ghc-in-browser) |
| **ormolu-live** | The Ormolu formatter (uses `ghc-lib-parser`, `file-embed`, `lens`, `containers`) as a wasm reactor module in a web worker with `jsaddle-wasm`. Shows the worker plus reactor pattern with a real compiler front end. | [tweag/ormolu `ormolu-live`](https://github.com/tweag/ormolu/tree/master/ormolu-live) (`-no-hs-main -optl-mexec-model=reactor`) |
| **purjs** (GHCJS, 2020) | The only prior attempt on `purs`; abandoned ([research 01](01-purescript-in-browser.md)). | |

None of these is a PureScript port. No source I found reports `purs` built for wasm or JS. Absence of evidence, not proof.

## 7. What the port would need (a plan, not done)

1. Pick the toolchain: GHC 9.8 wasm flavour (matches `purs` pins) or stay on 9.14 and absorb dependency drift.
2. A small package `purs-core` (not `purs`): library only, in-memory `MakeActions`, exports like `check :: ByteString -> ... -> JSON`, built as a wasi reactor, called from a worker.
3. Patch or replace: `basement`/`memory`/`crypton` (drop the cache hashing), `network` (via `monad-logger`/`fast-logger`), pin `cborg` to git master, local `cheapskate` patch, pre-generated `Parser.hs`, exclude `process`/`haskeline`/REPL/ide/publish modules.
4. Measure: wasm size (raw, gzip, brotli), start-up, memory, and one-module check time against a loaded `Prelude`.
5. Publish externs for the supported libraries as fingerprinted static files; decide how Solution output (ES modules) is loaded.

## 8. Licences

`purs`: BSD-3-Clause ([research 01](01-purescript-in-browser.md)). The wasm runtime links `gmp` (LGPL) in the default flavour; the `native` flavour of `ghc-wasm-meta` avoids that ([README](https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta), "flavour" notes). Worth a note if the compiler bundle is shipped.

## Open questions this raises

- Does the real `purescript` library compile on wasm32 once the listed blockers are patched? (The decisive test; about a day of work, not done.)
- Can `memory`/`crypton` be dropped cleanly (only `Make/Cache.hs` imports them directly; transitive uses unchecked)?
- Real bundle size and check time, which decide whether a 400 ms edit-pause check is plausible or the check must run on demand.
- 9.8 flavour versus 9.14: is the drift risk acceptable, or is the 9.8 toolchain affordable in this repo's Nix setup?
- Size and number of the `externs.cbor` files for the libraries a Solution may import.
