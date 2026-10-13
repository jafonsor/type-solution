# PROTOTYPE (throwaway): reflex-dom → wasm on macOS, without Obelisk

Answers [Task: get Obelisk v2 building on this Mac](../.scratch/type-solution/issues/09-task-obelisk-on-mac.md) for the frontend half: Obelisk v2's reflex-dom → WebAssembly pipeline, extracted and built natively on aarch64-darwin. There is no Linux builder and no Nix ≥ 2.27, and GHC isn't built from source.

    ./build.sh          # -O1 dev build into dist/ (GHC 9.14; GHC_FLAVOUR=9_12 for 9.12)
    ./build.sh --prod   # -O2 + wasm-opt -O2 + wasm-tools strip (Obelisk's prod steps)
    python3 -m http.server 8137 -d dist   # http://localhost:8137

The script re-execs itself inside `nix shell` on ghc-wasm-meta when `wasm32-wasi-cabal` isn't on PATH. Cabal's store and index live in `~/.ghc-wasm/.cabal`, ghc-wasm-meta's default location.

## What was extracted from Obelisk v2.0.0.0 (313f684b)

| Piece | Obelisk source | Here |
|---|---|---|
| wasm GHC | ghc-wasm-meta `5b96779e` (`deps/nix-haskell/pins/ghc-wasm-meta`). Obelisk's default series is 9.14; its nixpkgs path uses 9.12 | same pin, `nix shell …#all_9_14` (or `all_9_12`) |
| reflex-dom with the jsaddle-wasm run path | `deps/reflex-dom` submodule `7193774e` | `source-repository-package` |
| jsaddle-wasm fix | `nix-haskell/modules/patches/wasm/jsaddle-wasm` (declares `initialSyncDepth`) | `vendor/jsaddle-wasm` 0.1.2.1 with the patch applied |
| link flags | `-no-hs-main -optl-mexec-model=reactor -optl-Wl,--export=hs_start` + `foreign export javascript "hs_start"` | `frontend/frontend.cabal`, `Main.hs` |
| TH needs shared libs | `shared: True` under `arch(wasm32)` | `cabal.project` |
| constraints | `some < 1.1`, `semialign < 1.4`, splitmix fork, `allow-newer: *:*` | `cabal.project` |
| jsexe assembly | `Obelisk.Setup.Frontend.Wasm`: copy wasm, `post-link.mjs` → `ghc_wasm_jsffi.js`, `shim.js` → `all.js`, `@bjorn3/browser_wasi_shim` dist (`index.js` → `wasi-shim.js`), wasm-opt/strip | `build.sh`, `www/all.js` (verbatim copy of `lib/setup/data/shim.js`) |

Dropped: obelisk-route, obelisk-frontend, hydration/prerendering, the Snap backend, the static asset manifest, and brotli/gzip precompression.

## One divergence from Obelisk (9.12 only)

Obelisk's `lib/cabal.project.config` sets `time >= 1.15` for wasm32. That suits its GHC 9.14 haskell.nix build, but the 9.12 bindist ships `time-1.14`, so the constraint forces a Hackage rebuild of time, unix and directory, and the rebuilt `unix-2.8.8.0` fails to compile (hidden `os-string`). Here the boot packages are pinned with `installed`.

## Results (2026-10-13, M-series Mac, Nix 2.24.9)

- **Toolchain:** `nix build …#all_9_12` took about 10 min the first time, nearly all of it downloads (GHC 9.12.4 bindist, wasi-sdk, binaryen, wasm-tools, node), and compiled nothing.
- **Clean build:** the reflex-dom dependency tree (lens, aeson, jsaddle, reflex, reflex-dom-core and the rest) took about 10 min of wall time, over two runs because of the `time` fix.
- **Rebuild:** about 5–7 s after editing `Main.hs`, including the `cabal update` index check.
- **Runs in Chrome:** headless chrome-headless-shell 148 rendered the `<h1>`, a 3-click counter, a text input echo and length, and a `dyn_` swap in/out, with no console errors. First render was about 110–140 ms on localhost, served with `python3 -m http.server`.

`--prod` sizes. Only local packages get `-O2`; dependencies stay at cabal's default `-O1`:

| File | Raw | gzip -7 | brotli q11 |
|---|---|---|---|
| `frontend.wasm` | 4.00 MB | 1.05 MB | 769 KB |
| JS glue (11 files) | 72 KB | – | 15 KB |

That is smaller than Obelisk's skeleton (5.47 MB raw / 942 KB br), because obelisk-route, obelisk-frontend and the hydration layer are gone.

On **GHC 9.14** (now the default) the same check passes. Prod `frontend.wasm` is 4.27 MB raw / 802 KB brotli, and the clean dependency build took about 12 min.

**Fragility note:** jsaddle-dom's shared library has a linker-generated `__wasm_apply_data_relocs` of about 10.6 MB. That only loads for Template Haskell because the haskell-wasm wasm-ld splits it into pieces of at most 7,654,300 bytes, under V8's 7,654,321-byte function limit. A link without that split fails in reflex-dom-core's TH (see ticket 09).
