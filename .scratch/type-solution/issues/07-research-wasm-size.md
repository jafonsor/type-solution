# Research: Obelisk v2 WebAssembly frontend size

Type: research
Status: resolved

## Question

How big is an Obelisk v2 reflex-dom frontend when shipped to the browser, with the WebAssembly target compared to the GHC JavaScript-backend target? Measure (or find primary figures for) a minimal reflex-dom app and, if feasible, one embedding a JS shim, after Obelisk's prod pipeline (wasm-opt/strip or Closure ADVANCED), raw and brotli/gzip. Also note initial load/startup time and any blockers hit while building.

## Comments

Findings: ../research/wasm-size.md

- No local build: Obelisk v2's Nix builds are Linux-only (macOS support is a pending follow-up), the configured aarch64-linux builder VM was down, and the reflex-frp caches aren't set up. Instead, I measured Obelisk's own CI outputs for the v2.0.0.0 skeleton, a minimal reflex-dom + obelisk-route app, pulled from `nixcache.reflex-frp.org`.
- Wasm (default, GHC 9.14, wasm-opt -O2 + strip): `frontend.wasm` is 5.47 MB raw, 942 KB brotli and 1.34 MB gzip. The JS glue adds about 72 KB raw / 15 KB brotli over 11 extra requests. That is about **956 KB brotli on the wire**.
- JS (GHC 9.14, Closure ADVANCED): `all.js` is 4.04 MB raw, 497 KB brotli and 753 KB gzip, in 1 request. Wasm is about 1.9× the JS build after brotli. The GHC 9.12 builds (nixpkgs driver) are within ±6% of these.
- Startup (headless Chrome, M1 Max, brotli served): on localhost, wasm renders in about 45 ms and JS in about 130 ms, because JS spends about 100 ms parsing. On a 9 Mbit/s link with 40 ms RTT it flips: wasm takes about 1.18 s and JS about 0.59 s. At 1.6 Mbit/s it is 5.9 s against 2.9 s.
- JS-shim variant: not built. CM6 alone is 144 KB brotli (170 KB gzip), and Obelisk serves it as a separate static asset. My estimate (inference) is about 1.10 MB brotli total for wasm and about 0.64 MB for JS.
- Other data point: tweag's reflex-todomvc wasm (GHC 9.12, wizer + wasm-opt -O4) is 4.25 MB raw / 836 KB brotli, smaller than the Obelisk skeleton. I found no other published wasm figure for reflex-dom.

## Answer

Facts only; the choice is deferred to "Grilling: Obelisk compile target". For the minimal Obelisk v2 skeleton, the default wasm build ships about 956 KB brotli (5.5 MB raw) and the JS/Closure build about 497 KB brotli (4.0 MB raw), so wasm is roughly 2× larger compressed. On a fast connection wasm starts faster (about 45 ms against 130 ms locally). On a constrained one it takes about twice as long, because download time dominates. With CM6 the totals come to an estimated 1.1 MB and 0.64 MB brotli. I could not build locally because Obelisk v2's Nix builds are Linux-only. All figures come from Obelisk's own CI artifacts. Full detail: ../research/wasm-size.md

## Comments

Findings: ../research/wasm-size.md

- Sizes come from Obelisk's own v2.0.0.0 CI build of the skeleton app, fetched from the reflex-frp cache. No published figures exist anywhere else.
- **WASM:** 11 files. 5.55 MB raw, about 1.36 MB gzip, about 0.96 MB brotli. `frontend.wasm` alone is 5.47 MB raw and 942 KB brotli.
- **JS:** one Closure ADVANCED `all.js`. 4.04 MB raw, 752 KB gzip, 497 KB brotli. That is about half the WASM transfer.
- **Startup** (headless Chrome, h1 rendered): on loopback, WASM 63 ms vs JS 180 ms. At 10 Mbps with 4x CPU throttle, WASM 1.25 s vs JS 0.72 s.
- **Local build is blocked on macOS.** Obelisk v2 nix builds are Linux-only, its flake needs Nix ≥ 2.27, `glibcLocales` evaluates to null on darwin, and the wasm GHC compiles from source. No Linux builder is running, so a custom app with a JS shim was not measured.

## Answer

These figures come from Obelisk v2.0.0.0's own CI build of its starter app, read from the public reflex-frp cache, because a local build on macOS was blocked.

| Target | Raw | gzip | brotli |
|---|---|---|---|
| WASM | 5.55 MB | ≈1.36 MB | ≈0.96 MB |
| JS (Closure ADVANCED) | 4.04 MB | 752 KB | 497 KB |

Startup in headless Chrome, measured to the heading appearing:
- **Local:** WASM 63 ms, JS 180 ms.
- **10 Mbps with 4× CPU slowdown:** WASM 1.25 s, JS 0.72 s.

We didn't measure a custom app with a CM6 shim.

**Blocker:** Obelisk v2's Nix builds are Linux-only. Its flake needs Nix ≥ 2.27 (this Mac has 2.24), evaluation fails on macOS, and the configured Linux builder isn't running (starting it needs sudo). See "Task: get Obelisk v2 building on this Mac".

Full detail: ../research/wasm-size.md
