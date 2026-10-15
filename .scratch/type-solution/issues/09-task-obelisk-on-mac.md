# Task: get Obelisk v2 building on this Mac

Type: task
Status: resolved

## Question

Can Obelisk v2 build the Obelisk starter app (WASM and JS targets) from this macOS machine? Known blockers from "Research: Obelisk v2 WebAssembly frontend size":
- Nix is 2.24, but the flake needs 2.27 or newer.
- Obelisk v2's Nix builds are Linux-only.
- The configured Linux builder isn't running, and starting it needs sudo.

Likely steps are upgrading Nix, getting a Linux builder working (nix-darwin linux-builder, a VM, or a remote builder), and making sure the reflex-frp binary caches are used so the WASM GHC isn't built from source. This is HITL where sudo is required. Record what was done and how long a clean build and a rebuild take. If it can't be made to work, the stack choice in "Grilling: choose the frontend stack" reopens.

## Comments

- 2026-10-13: Frontend half done, **without Obelisk**. Obelisk v2's reflex-dom → wasm pipeline was extracted and built natively on this Mac: [prototype-reflex-wasm/](../../../prototype-reflex-wasm/README.md). No Nix upgrade, no Linux builder, no sudo, and no GHC built from source.
  - The pieces are small: the ghc-wasm-meta 9.12 bindist at Obelisk's pin (it ships aarch64-darwin), Obelisk's reflex-dom fork, jsaddle-wasm with a one-line patch, reactor link flags plus a `hs_start` export, `post-link.mjs`, Obelisk's `shim.js` bootstrap and `@bjorn3/browser_wasi_shim`.
  - Timings: clean dependency build about 10 min, rebuild about 5–7 s.
  - It runs in headless Chrome: events, input and `dyn_` all work.
  - Prod wasm is 4.0 MB raw / 769 KB brotli.
  - One fix was needed: drop Obelisk's `time >= 1.15` and pin the boot packages as `installed`.
- Not covered: the Obelisk framework itself (obelisk-route, hydration, Snap backend, `ob run`), and the GHC JS-backend target. The open question for "Grilling: choose the frontend stack" is whether we need Obelisk at all, or plain reflex-dom plus a static server.
- 2026-10-13: **Obelisk's own nix build on darwin (no VM).** Nothing in Obelisk's nix restricts Linux; the flakes expose all systems. On a scratch clone of v2.0.0.0 these changes were needed:
  - `nix/module.nix`: set `LOCALE_ARCHIVE` only when `isLinux` (`glibcLocales` is null on darwin).
  - `nix/lib.nix`: `builtins.fetchTarball` → `pkgs.fetchzip` for browser_wasi_shim (`sha256-lfKZk1ZF…`). The builtin unpacker's hash differs on Nix < 2.27.
  - Build `skeleton/release.nix -A serverExe.wasm-meta.haskell-nix.wasm`, the existing cell that uses the ghc-wasm-meta 9.14 bindist, so GHC isn't compiled from source. Use the non-flake path because the flake needs Nix ≥ 2.27.
- Result: evaluation passes and the wasm dependency tree builds (lens, aeson, jsaddle, jsaddle-dom, jsaddle-wasm). **It fails in reflex-dom-core's Template Haskell:** Node/V8 refuses jsaddle-dom's `.so` because `__wasm_apply_data_relocs` is 10,880,277 bytes and V8's per-function limit is 7,654,321.
  - The haskell-wasm LLVM fork's wasm-ld (`abacb164`, `lld/wasm/InputChunks.cpp`) splits that function at 7,654,300 bytes.
  - Obelisk's Linux CI jsaddle-dom `.so` (cache path `9lp76j…`) is split: 7,654,312 + 3,225,965 = the same 10,880,277 bytes.
  - My darwin cabal builds (9.12 and 9.14) are split too.
  - Only the darwin **nix** link is unsplit. Inside that build env GHC's settings, clang `-###` and Cabal's link line all resolve to the fork's wasm-ld (byte-identical binary). Root cause not found yet.
- Also: prototype-reflex-wasm now defaults to GHC 9.14 (`GHC_FLAVOUR=9_12` to switch). On 9.14 it passes the same headless-Chrome check; prod wasm is 4.27 MB raw / 802 KB brotli.
- 2026-10-13: **Obelisk v2's own Nix build now works on this Mac, with no Linux VM.** The skeleton's `serverExe.wasm-meta.haskell-nix.wasm` builds:
  - the wasm frontend uses the prebuilt GHC 9.14 for wasm;
  - the backend is native macOS.
  - The server renders the page, and the wasm app loads and takes it over in headless Chrome: about 2,100 Haskell→JS bridge calls and a clean console.
  - `frontend.wasm` is 5.86 MB raw / 1.01 MB brotli, the same as Obelisk's Linux CI build of this variant.
- Fork: <https://github.com/jafonsor/obelisk/tree/macos-v2>, based on v2.0.0.0, with its `deps/nix-haskell` submodule pointing at <https://github.com/jafonsor/nix-haskell/tree/macos>, based on v1.0.0. A fresh `--recurse-submodules` clone builds the identical `server-exe` store path. The fixes:
  1. `nix/module.nix`: locale archive only on Linux.
  2. `nix/lib.nix`: fetch the WASI shim with `fetchzip` (same hash on any Nix version).
  3. nix-haskell `ghc-wasm-meta`: pin the wasi-sdk's `wasm-ld` with `-fuse-ld=`. Root cause: clang prefers a `wasm32-unknown-wasi-wasm-ld` on PATH. On Linux that one comes from haskell.nix's patched LLVM (`llvm-source-21.1.8-haskell`). On darwin haskell.nix's LLVM override doesn't apply, so it's upstream lld, which doesn't split `__wasm_apply_data_relocs`, and jsaddle-dom's 10.9 MB function exceeds V8's limit in Template Haskell.
  4. `nix/lib.nix`: link frontend/static assets into the data dir via `${data:-$out}` at either depth. On darwin haskell.nix makes no separate data output, so the backend 404'd every asset.
- Build: `nix-build skeleton/release.nix -A serverExe.wasm-meta.haskell-nix.wasm` with the reflex-frp and IOG caches passed as `--option extra-substituters`. Nix 2.24 works through this non-flake path.
- Not done yet: the JS target, the `ob`/dev-loop tooling on macOS, why haskell.nix's patched LLVM doesn't reach the darwin cross toolchain (also affects wasi-libc/libc++ there), and upstream PRs.
- 2026-10-13: **`ob-run` works on macOS** with fork commit `69d3b9f2` ("ob-run, ob-init: work on macOS"):
  - `ob-run` uses `fswatch` when not on Linux, since `inotify-tools` is Linux-only and the dev shell refused to evaluate.
  - `ob-init` gets GNU sed.
  - Dev shell: `nix-shell skeleton/release.nix -A shell.wasm-meta.haskell-nix` (with the caches as `--option extra-substituters`). The README's `-A haskell-nix` would compile the wasm GHC from source. The first shell build is long because it builds haddocks for every dependency (`withHoogle`).
  - Result: in the skeleton, `ob-run -- --port=8140` serves the app, and the wasm frontend runs in Chrome with a clean console. Editing the h1 in `Frontend.hs` triggered one rebuild/restart in about 15 s, and the new text was served.
- 2026-10-15: **The Type Solution app runs on the fork** (`macos-v2` at `12f0a43`). Since the answer below:
  - The app was scaffolded with `ob-init` as a flake, so the dev shell is the flake's `devShells.default`. direnv (`.envrc`, nix-direnv) loads it on `cd` and VS Code's direnv extension uses it; HLS 2.14 for GHC 9.14 is in the shell.
  - New fork commits: `ob-init` leaves `release.nix` out of new projects; the skeleton gives haskell.nix the ghc-wasm-meta 9.14 bindist on darwin; the shellHook's help and EXIT trap run only in interactive shells (direnv loaded nothing before); nix's git is in the shell on darwin; the dev shell is built without the backend's asset hooks, so loading it no longer compiles the production frontend after a frontend change.

## Answer

**Yes, for the WebAssembly target, without a Linux VM**, using the fork <https://github.com/jafonsor/obelisk/tree/macos-v2>. It's based on v2.0.0.0, with its nix-haskell submodule at <https://github.com/jafonsor/nix-haskell/tree/macos>. The fork carries five macOS fixes: locale archive, WASI-shim fetch, wasm linker pin, data-dir asset links, and `ob-run`/`ob-init`.
- **Production:** `nix-build skeleton/release.nix -A serverExe.wasm-meta.haskell-nix.wasm`. A fresh clone reproduces the tested `server-exe`. The app hydrates in Chrome.
- **Development (the app, today):** `cd` into the project and direnv loads the dev shell, then `ob-run`. Rebuild and restart on save take about 15 s. The flake's `nixConfig` brings the reflex-frp and IOG caches (`.envrc` passes `--accept-flake-config`). Nix is now 2.34.
- **Development (the skeleton, as first tested):** `nix-shell skeleton/release.nix -A shell.wasm-meta.haskell-nix`, then `ob-run`, passing the caches with `--option extra-substituters`.
- The JS target was dropped: see "Grilling: Obelisk compile target".
- Open, non-blocking: upstream PRs; why haskell.nix's patched LLVM doesn't reach the darwin cross toolchain; `ob-repl` and `ob-watch` haven't been exercised yet; haskell.nix's `shellFor` forces local packages' hooks (worth an upstream issue).
