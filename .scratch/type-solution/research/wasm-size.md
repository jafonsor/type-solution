# Research: Obelisk v2 frontend size, WASM vs JS target

Ticket: [07-research-wasm-size](../issues/07-research-wasm-size.md). Researched 2026-10-12/13.
Builds on [frontend-frp.md](frontend-frp.md) §1.1–1.2 (backends, Obelisk v2 overview, earlier JS-backend size figures), which this note does not repeat.

**Short answer.** For the Obelisk v2.0.0.0 skeleton app (an `<h1>` and a `<p>`, built by Obelisk's own CI with its prod pipeline):

| Target | Files shipped | Raw | gzip (as shipped) | brotli q11 (as shipped) |
|---|---|---|---|---|
| **WASM** (default, haskell.nix GHC 9.14) | 11 (`frontend.wasm` + 10 small JS) | 5.55 MB | 1.36 MB | **0.96 MB** |
| **JS** (`target = "js"`, Closure ADVANCED) | 1 (`all.js`) | 4.04 MB | 0.75 MB | **0.50 MB** |

So the JS target ships about **half the bytes** of the WASM target over the wire. Locally, though, WASM reached first render about 3× faster (63 ms vs 180 ms median), because compiling WASM is cheaper than parsing and running 4 MB of JS. On a throttled 10 Mbps link, JS won (0.72 s vs 1.25 s), because transfer time dominates. This is the floor: Type Solution adds its own code plus CM6 (about 170 KB gz, see frontend-frp.md) on top.

I could not reproduce the build locally on this Mac. Obelisk v2's nix builds are Linux-only, and on darwin the evaluation starts compiling the wasm GHC cross-compiler from source (details under Blockers).

---

## 1. Where the numbers come from

### 1.1 Published figures: none found
- The Obelisk README, `docs/setup.md`, `docs/cabal.md`, the v2.0.0.0 ChangeLog/release, and [PR #1139](https://github.com/obsidiansystems/obelisk/pull/1139) describe the size pipeline but give **no sizes**. The pipeline is wasm-opt + `wasm-tools strip` for WASM, Closure for JS, and brotli + gzip for both. [Obelisk README, Options table](https://github.com/obsidiansystems/obelisk#options), [PR #1139 body](https://github.com/obsidiansystems/obelisk/pull/1139)
- Obelisk issue search: "wasm size" and "bundle size" return nothing. Obelisk CI uploads no artifacts (`actions/artifacts` total_count = 0).
- [tweag/ghc-wasm-reflex-examples](https://github.com/tweag/ghc-wasm-reflex-examples) describes its wizer → wasm-opt → strip pipeline but publishes no sizes. The [jsaddle-wasm README](https://github.com/haskell-wasm/jsaddle-wasm) and the reflex-dom issues have no size figures either.
- Haskell Discourse searches ("obelisk wasm size", "reflex wasm bundle size", "jsaddle-wasm", "wasm reflex") turned up no reflex-dom WASM size report.
- The only published reflex/JS-backend figures remain the ones already in frontend-frp.md: the [Haskell blog minification report](https://blog.haskell.org/report-of-js-code-minification/) and the [Discourse JS-size thread](https://discourse.haskell.org/t/ghc-js-backend-improve-compiled-size/12098) (about 3.3 MiB after Closure for one Reflex app).

### 1.2 Obelisk's own CI build artifacts (primary, measured)
Obelisk's `nix` workflow run for the **v2.0.0.0 release commit** builds the skeleton's `serverExe` for every driver and target. [Run 38050145084](https://github.com/obsidiansystems/obelisk/actions/runs/38050145084) is titled "Release Obelisk v2.0.0.0", with head `313f684b`, which is the commit the `v2.0.0.0` tag points to. Its log names the frontend store paths, and those are in the public reflex-frp binary cache. I fetched them read-only with `nix store ls|cat --store https://nixcache.reflex-frp.org …`, which needed no local nix config change.

| CI job | Store path | Content |
|---|---|---|
| `skeleton.serverExe.haskell-nix.wasm` (the default) | `zfzhrz0f…-frontend.jsexe.wasm` | `frontend.wasm` + JS glue |
| `skeleton.serverExe.haskell-nix.js` | `l2zrgmxj…-frontend.jsexe-optimized` | Closure output `all.js` |
| `skeleton.serverExe.nixpkgs.wasm` (GHC 9.12 bindist) | `rp0782qb…-frontend.jsexe.wasm` | |
| `skeleton.serverExe.wasm-meta.haskell-nix.wasm` | `n0r7gxfs…-frontend.jsexe.wasm` | |
| `skeleton.serverExe.nixpkgs.js` | `dw1izbar…-frontend.jsexe-optimized` | |

What it is: the skeleton frontend is `el "h1" $ text "Welcome to Obelisk"` plus one `<p>`, using obelisk-route, the Frontend/hydration machinery, and reflex-dom. [skeleton/frontend/src/Frontend.hs @ v2.0.0.0](https://github.com/obsidiansystems/obelisk/blob/313f684b9288094beb0e6b99489fae8f70f1f8ad/skeleton/frontend/src/Frontend.hs). It is a realistic "empty app" floor, not a bare `mainWidget`.

How it was processed (source at the tag):
- **WASM:** `wasm-opt -all -O2 -ol 2 -s 1 --low-memory-unused --strip-dwarf --converge`, then `wasm-tools strip -a`. [nix-haskell `bundle-optimizer/wasm-opt/run.nix`, `options.nix` defaults](https://github.com/reflex-frp/nix-haskell) (Obelisk submodule `deps/nix-haskell` v1.0.0). The cached `frontend.wasm` has **no custom sections** (no `name`, no `producers`), which I checked with a section parser. That is consistent with the strip having run. Code section: 4.23 MB. Data section: 1.08 MB.
- **JS:** Closure `--compilation_level ADVANCED` with the jsexe's `all.externs.js`. [nix-haskell `bundle-optimizer/closure-compiler/run.nix`](https://github.com/reflex-frp/nix-haskell); level default `"ADVANCED"` [Obelisk README Options](https://github.com/obsidiansystems/obelisk#options). The cached `all.js` is visibly Closure-minified.
- **Compression:** `brotli -c -q 11` and `gzip -c7`, served by content negotiation. [obelisk `nix/assets.nix` @ v2.0.0.0](https://github.com/obsidiansystems/obelisk/blob/313f684b9288094beb0e6b99489fae8f70f1f8ad/nix/assets.nix). I read the CI-produced `encodings/br` and `encodings/gzip` files for `frontend.wasm` and `all.js` straight from the cache; they are the "as shipped" numbers below.

## 2. Sizes (bytes)

### 2.1 WASM target (haskell.nix driver, GHC 9.14; Obelisk default)

| File | Raw | gzip | brotli |
|---|---|---|---|
| `frontend.wasm` | 5,474,061 | **1,345,368** (CI) | **941,746** (CI) |
| `ghc_wasm_jsffi.js` (post-link JSFFI glue) | 26,289 | 5,046 | 4,373 |
| `all.js` (Obelisk bootstrap shim) | 2,934 | 1,314 | 1,109 |
| `wasi-shim.js` + `wasi.js`, `fd.js`, `fs_mem.js`, `fs_opfs.js`, `wasi_defs.js`, `debug.js`, `strace.js` (`@bjorn3/browser_wasi_shim` 0.4.2) | 42,896 | 10,309 | 9,120 |
| **Total (11 requests)** | **5,546,180** | **≈1,362,000** | **≈956,300** |

The JS rows are my own `gzip -7` and `brotli -q 11`, the same settings as the pipeline.

Other WASM variants from the same CI run, `frontend.wasm` only (raw / brotli q11): nixpkgs driver with the GHC 9.12 bindist is 5,497,588 / 968,498. haskell.nix with the ghc-wasm-meta bindist is 5,864,729 / 1,006,000. So the toolchain choice moves the size by roughly ±7%.

### 2.2 JS target (haskell.nix driver, GHC 9.14 JS backend, Closure ADVANCED)

| File | Raw | gzip | brotli |
|---|---|---|---|
| `all.js` (the only file `index.html` loads) | 4,043,325 | **752,337** (CI) | **496,642** (CI) |

nixpkgs driver (GHC 9.12): `all.js` is 3,813,609 raw and 468,260 brotli.

The jsexe also contains unminified `out.js` (14.4 MB), `lib.js`, `rts.js`, `all.externs.js` and `out.stats`. The asset server publishes them, but the page never requests them, so they are not part of the download.

### 2.3 Comparison

- Over the wire with brotli, **WASM is about 1.9× JS** (956 KB vs 497 KB). With gzip it is about 1.8× (1.36 MB vs 0.75 MB). Raw, WASM is 1.37× JS.
- WASM machine code compresses worse (5.47 MB to 0.94 MB br, 17%) than Closure-minified JS (4.04 MB to 0.50 MB br, 12%).
- **Inference:** these are Obelisk-skeleton floors. Real app code and extra dependencies (e.g. aeson) grow them. CM6 adds about 170 KB gz on top regardless of target, measured in frontend-frp.md. I did not measure an app that embeds a JS shim, because that needs a working local build (see Blockers). A shim bundled separately by esbuild adds its own size without changing the Haskell payload.

## 3. Startup time (measured, headless Chrome)

Setup:
- chrome-headless-shell 148.0.7778.97 (puppeteer cache), on an Apple-silicon Mac (10 cores).
- Driven over CDP with a fresh browser context per run and the cache disabled.
- Served from `127.0.0.1` by a small Node server that sends `application/wasm` (so `instantiateStreaming` is used) and brotli q11 `Content-Encoding`.
- The page is a bare `<body>` plus `<script src="all.js" defer>`, without the backend's prerendered HTML.
- Metric: time from navigation start until the skeleton's `<h1>` appears in the DOM (MutationObserver plus `performance.now()`).
- Scripts are in the session scratchpad, not the repo.

| Condition | WASM (median, range) | JS (median, range) |
|---|---|---|
| Loopback, no throttling (7 runs) | **63 ms** (61–68) | **180 ms** (165–189; plus one 9.3 s outlier on the first run) |
| 10 Mbps down/up, 40 ms latency, 4× CPU throttle (5 runs) | **1,249 ms** (1,242–1,254) | **716 ms** (693–718) |

Notes:
- Unthrottled WASM breakdown: `frontend.wasm` finished downloading at about 28 ms, and the `<h1>` appeared at about 61 ms. So compile, instantiate, RTS init and first render took about 33 ms. For JS, `all.js` arrived at about 42 ms and DOMContentLoaded fired at about 158 ms, which leaves about 120 ms of parse and eval. JS heap after load: about 10 MB (WASM page) vs 21 MB (JS page).
- Throttled, the extra 460 KB the WASM build sends costs about 0.4 s at 10 Mbps, which outweighs its CPU advantage. **Caveat:** CDP CPU throttling may not slow V8's background WASM compile threads, so the throttled WASM figure may flatter WASM on a real slow phone.
- Both builds logged `reflex-dom warning: hydration failed … rendering from scratch` (WASM via `[WASI stdout]`). That happened because I served no prerendered markup. Under the real Obelisk backend the page arrives prerendered and hydrates, so first paint happens before any Haskell runs. These timings are time-to-interactive-render, not first paint.

## 4. Blockers hit (local build on macOS)

Each blocker is its own bullet; the Obelisk docs back the first.

1. **Obelisk v2 nix builds are Linux-only.**
   - Upstream says: "the nix builds (and the nix dev shell, which provides the cross-compilers) are supported on Linux only… Other systems are exposed but untested; restoring macOS support is tracked as a follow-up." [Obelisk README, Building](https://github.com/obsidiansystems/obelisk#with-nix)
   - `docs/setup.md` says the same. The binary caches only serve `x86_64-linux` and `aarch64-linux`. [docs/setup.md](https://github.com/obsidiansystems/obelisk/blob/master/docs/setup.md)
2. **Nix version.**
   - `nix run 'github:obsidiansystems/obelisk/v2.0.0.0?submodules=1#init'` fails on this machine's Nix 2.24.9 with `unexpected flake input attribute 'submodules'`. Obelisk's `flake.nix` uses `self.submodules`, which needs Nix ≥ 2.27.
   - The non-flake path works for scaffolding: `git clone --recurse-submodules`, then `ob-init --link`. But `ob-init` uses GNU `sed -i` and errors on macOS BSD sed, so the project rename step fails. That one is harmless.
3. **Evaluation fails on darwin.**
   - `nix-build -A haskell-nix.serverExe.wasm` hits `cannot coerce null to a string` at `nix/module.nix:22`: `LOCALE_ARCHIVE = "${pkgs.glibcLocales}/…"`, and `glibcLocales` is null on darwin.
   - After patching that in a scratch clone, the vendored `@bjorn3/browser_wasi_shim-0.4.2.tgz` `fetchTarball` gave a **hash mismatch** under Nix 2.24. I suspect a tarball-unpacking difference between Nix versions; that is an inference.
4. **The GHC toolchain builds from source.** After patching the hash too, evaluation alone (`--dry-run`, through haskell.nix import-from-derivation) started *building* on darwin:
   - `hadrian`, `happy`, `language-c`, `wasilibc`, the wasm32 clang/LLVM wrappers, and Node.
   - Hadrian is GHC's build system, so this is the start of compiling the GHC 9.14 wasm cross-compiler from source. The caches have no darwin outputs.
   - I stopped there, per the ticket's stop rule. It also edits no global config.
5. **No Linux builder.**
   - `/etc/nix/nix.conf` lists `builders = ssh-ng://linux-builder aarch64-linux`, but nothing listens on `localhost:31022`, and no linux-builder launchd daemon is installed.
   - Starting one (nix-darwin `linux-builder`) needs sudo, so remote Linux builds were unavailable.
   - The user is in `trusted-users`, so passing `--option extra-substituters` for the reflex-frp/IOG caches on the command line works without editing global config. It just doesn't help on darwin.

**What would unblock a custom-app measurement** (e.g. skeleton plus a counter and an esbuild JS shim), all inferences:
- an `aarch64-linux`/`x86_64-linux` builder (the nix-darwin linux-builder, a Linux VM, or CI) with Nix ≥ 2.27 and the three caches. The skeleton's own outputs were already cached, so only the app's packages would build.
- or the nix-free path in [docs/cabal.md](https://github.com/obsidiansystems/obelisk/blob/master/docs/cabal.md): ghc-wasm-meta's darwin bindist, `wasm32-wasi-cabal`, `OBELISK_WASI_SHIM`, and `wasm-opt`/`wasm-tools` on PATH. That path compiles the whole reflex-dom dependency tree with the wasm GHC, and per docs/cabal.md it skips brotli/gzip and Closure.

## 5. Reproducing the size numbers

```bash
C=https://nixcache.reflex-frp.org
nix store ls  --store $C -lR /nix/store/zfzhrz0f8g5wc31qsszzajbhzaghi6yc-frontend.jsexe.wasm
nix store cat --store $C /nix/store/zfzhrz0f8g5wc31qsszzajbhzaghi6yc-frontend.jsexe.wasm/frontend.wasm > frontend.wasm
nix store ls  --store $C -lR /nix/store/l2zrgmxjvxqgzx02myzanimn8b7iy5kc-frontend.jsexe-optimized
# shipped encodings:
nix store cat --store $C /nix/store/jmif0f1cac8bl4kfclbmjpg3jgmp6lq8-encodings/br   | wc -c   # wasm br
nix store cat --store $C /nix/store/s5c5zfn4w2va1ph1hb9r469yd12dzwzv-encodings/br   | wc -c   # all.js br
```
Store paths come from the log of [run 38050145084](https://github.com/obsidiansystems/obelisk/actions/runs/38050145084), job `nix-smoke (skeleton.serverExe.haskell-nix.{wasm,js})`.
