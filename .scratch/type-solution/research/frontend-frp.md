# Research: FRP frontend options (reflex-dom vs PureScript)

Ticket: [01-research-frontend-frp](../issues/01-research-frontend-frp.md). Researched 2026-10-12.
Scope: a static SPA (no server) that embeds CodeMirror 6 (CM6, ES-module npm package) and runs hidden tests in a Web Worker. These are facts and trade-offs. The choice belongs to ticket 02.

Repo activity figures (last commit, latest release) come from the GitHub REST API (`gh api repos/<owner>/<repo>/commits|releases`), queried on 2026-10-12. "Measured" sizes come from builds I ran locally on 2026-10-12. Details are in the [Measurements](#measurements-local-2026-10-12) section.

---

## 1. reflex-dom (Haskell)

### 1.1 Compiler backends

There are three ways to get Haskell into a browser.

**a) Legacy GHCJS (separate compiler, GHC ≤ 8.10) through reflex-platform**
- reflex-platform's last release is v1.2.0.0 (2023-12-06). Its default compiler is still GHC 8.10.7 (changelog v1.1.0.0). The last commit is 2025-12-17 (an Android SDK bump). [reflex-platform ChangeLog](https://github.com/reflex-frp/reflex-platform/blob/develop/ChangeLog.md), [releases](https://github.com/reflex-frp/reflex-platform/releases)
- It needs Nix and does not support Windows. Its README warns that "GHCJS uses a lot of memory during compilation. 16GB of memory is recommended". [reflex-platform README](https://github.com/reflex-frp/reflex-platform#readme)
- Obelisk v2 (below) replaced reflex-platform with nix-haskell/haskell.nix. That makes reflex-platform the legacy path. [Obelisk ChangeLog v2.0.0.0](https://github.com/obsidiansystems/obelisk/blob/master/ChangeLog.md)

**b) GHC's built-in JavaScript backend (`javascript-unknown-ghcjs`, GHC 9.6+)**
- GHCup ships these bindists as experimental, "intended as a developer preview only". They need a matching emscripten install. [GHCup cross guide](https://www.haskell.org/ghcup/guide/cross/)
- The FFI is `foreign import javascript "((x) => ...)"`. Values are an opaque `JSVal`. Callbacks (`syncCallback`/`asyncCallback`) must be freed manually with `releaseCallback`. Nothing type-checks the JS. [GHC User's Guide: JavaScript backend](https://ghc.gitlab.haskell.org/ghc/doc/users_guide/javascript.html)
- reflex-dom-core 0.8.1.3 and 0.8.1.4 (Apr and May 2025) ship JS-backend fixes ("Fixes for JS backend FFI", "Support hashable 1.5 in JS backend"). [reflex-dom-core ChangeLog](https://github.com/reflex-frp/reflex-dom/blob/develop/reflex-dom-core/ChangeLog.md)
- Code size is the known weak point:
  - On a hello-world, unminified `all.js` is 2.2–6.8 MB. After Closure Compiler ADVANCED it is 387 KB–5.5 MB, and brotli brings it to about 74–182 KB, depending on which size fixes are applied. This is from the GHC blog, Sep 2024. [Haskell blog: JS code minification report](https://blog.haskell.org/report-of-js-code-minification/)
  - A user-reported Reflex app (May 2025) produced `all.js` of about 15 MiB on 9.10 and 14.6 MiB on 9.12.1, and about 3.3 MiB after Closure Compiler ADVANCED. No compressed figure was given. In the same thread, reflex maintainer alexfmpe ranked 9.10 worse than 9.12, which is worse than 8.6 and better than 8.10. [Discourse: GHC JS backend, improve compiled size](https://discourse.haskell.org/t/ghc-js-backend-improve-compiled-size/12098)

**c) GHC's WebAssembly backend (`wasm32-wasi`) plus `jsaddle-wasm`**
- The GHC User's Guide still says the wasm backend is "still a tech preview and not included in the official bindists yet". [GHC User's Guide: wasm](https://ghc.gitlab.haskell.org/ghc/doc/users_guide/wasm.html)
- Toolchains come from `ghc-wasm-meta`, which offers flavours `9.6` through `9.14` (default `9.14`). You install it with a Nix flake (`nix shell gitlab:haskell-wasm/ghc-wasm-meta…`), a non-Nix `bootstrap.sh`, or a dedicated ghcup channel. It warns: "Ensure you use cabal 3.14 or earlier version, there's a fatal regression in 3.16". Prebuilt artifacts exist for `{x86_64,aarch64}-{linux,darwin}`. Browser support covers the latest Chrome, Firefox and Safari through `browser_wasi_shim`. [ghc-wasm-meta README](https://github.com/haskell-wasm/ghc-wasm-meta/blob/master/README.md) (GitHub mirror of gitlab.haskell.org/haskell-wasm/ghc-wasm-meta). The last commit was 2026-10-12.
- The JSFFI works like this:
  - `foreign import javascript` imports are async by default and may use `await`. `unsafe` marks a sync import.
  - Exports are async by default, with a `sync` variant. `"wrapper"` turns a Haskell closure into a JS function.
  - A post-linker (`post-link.mjs`) generates the JS glue module.
  - Template Haskell works through an external interpreter, and also in the browser.

  [GHC User's Guide: wasm JSFFI](https://ghc.gitlab.haskell.org/ghc/doc/users_guide/wasm.html)
- `jsaddle-wasm` runs JSaddle `JSM` (what reflex-dom uses) on the wasm backend. Its README says "This project is in an early stage." It needs GHC ≥ 9.10 with sync JSFFI exports. It can run the Haskell side inside a Web Worker (`runWorker`). The catch: "everything relying on synchronous callbacks (e.g. `stopPropagation`/`preventDefault`) definitely no longer works". [jsaddle-wasm README](https://github.com/amesgen/jsaddle-wasm)
  - On Hackage the latest is 0.1.2.1 (2025-07-10). Version 0.2.0.0 is "TBA" in the changelog. [Hackage](https://hackage.haskell.org/package/jsaddle-wasm), [CHANGELOG](https://github.com/haskell-wasm/jsaddle-wasm/blob/master/CHANGELOG.md)
  - 0.1.2.0 stopped using JS `eval`, so it works under a CSP without `unsafe-eval`. It still needs `wasm-unsafe-eval`. [same CHANGELOG]
- The reflex-dom `develop` branch merged "ghc-9.14-js-wasm" on 2026-08-27 ("Allow jsaddle-wasm 0.2", "Do not import ghcjs-base on the GHC JavaScript backend"). It also merged "Use new Javascript FFI for js_dataView" on 2026-09-19. None of this is on Hackage yet: the latest releases there are reflex-dom 0.6.3.4 (2025-04-05) and reflex-dom-core 0.8.1.4 (2025-05-15). [reflex-dom commits](https://github.com/reflex-frp/reflex-dom/commits/develop), [Hackage reflex-dom-core](https://hackage.haskell.org/package/reflex-dom-core)
- reflex-dom's own CI only builds native GHC 9.2–9.12. Neither JS nor wasm targets are in its matrix. [reflex-dom haskell.yml](https://github.com/reflex-frp/reflex-dom/blob/develop/.github/workflows/haskell.yml). JS and wasm are exercised downstream in Obelisk v2's `release.nix` matrix (below).
- Tweag keeps a reflex-todomvc example built with wasm and jsaddle-wasm (GHC 9.10; last push 2025-10-11). Its prod build runs `wizer`, then `wasm-opt`, then `wasm-tools strip`. The live demo link in its README returned 404 on 2026-10-12. [tweag/ghc-wasm-reflex-examples](https://github.com/tweag/ghc-wasm-reflex-examples)
- Wasm bundle size for a reflex-dom app: I found **no published primary figure**, and I did not build one. Building needs the wasm toolchain plus the full reflex dependency tree.

### 1.2 Build tooling

- **Obelisk v2.0.0.0** was released 2026-10-10, two days before this research. It is a breaking rewrite. [Release](https://github.com/obsidiansystems/obelisk/releases/tag/v2.0.0.0), [PR #1139](https://github.com/obsidiansystems/obelisk/pull/1139), [ChangeLog](https://github.com/obsidiansystems/obelisk/blob/master/ChangeLog.md)
  - It moves from GHC 8.10 to 9.14. **WASM becomes the default frontend target**, and the JS backend is available through `obelisk.frontend.target = "js"`.
  - reflex-platform is replaced by nix-haskell/haskell.nix. Plain `cabal build` / `cabal run` works, using Setup.hs hooks for the frontend cross-compile.
  - The `ob` CLI is removed in favour of `ob-run`, `ob-repl`, `ob-watch` and similar scripts.
  - Its prod pipeline runs Closure Compiler ADVANCED for JS, and `wasm-opt` plus `wasm-tools strip` for wasm, with brotli and gzip.
  - Caveat for the dev loop: "v1's interpreted in-process reload (ghcid plus jsaddle-warp) is not restored yet, and is the flagship follow-up." `ob-run` is a watch-and-rebuild server.
  - Obelisk is a **full-stack** framework: the project layout includes `backend/` (Snap) and the backend serves `frontend.jsexe`. [Obelisk README](https://github.com/obsidiansystems/obelisk#readme). Type Solution has no server, so Obelisk would be carrying parts it does not use. That is an inference.
  - Quick Start needs Nix "with the reflex-frp binary caches configured… Without the caches your first build compiles the toolchain from source." [Obelisk README](https://github.com/obsidiansystems/obelisk#quick-start)
- **Without Obelisk**: use ghc-wasm-meta or ghcup for `wasm32-wasi-ghc`, then `wasm32-wasi-cabal build`, then `post-link.mjs`, then (in prod) wizer, wasm-opt and strip. This is the tweag `build.sh` recipe. It needs no Nix. [tweag build.sh](https://github.com/tweag/ghc-wasm-reflex-examples/blob/main/frontend/build.sh), [ghc-wasm-meta README](https://github.com/haskell-wasm/ghc-wasm-meta/blob/master/README.md). The reflex-dom `develop` changes for jsaddle-wasm 0.2 are unreleased, so for now you would pin reflex-dom from git.

### 1.3 Dev loop

- The classic reflex-dom loop is **jsaddle-warp**. The app is compiled with native GHC (so `ghcid` / GHCi reload works) and drives the browser DOM over a WebSocket. [jsaddle README](https://github.com/ghcjs/jsaddle). reflex-dom pinned a "jsaddle-warp batch-pump fix" on 2026-10-11, so it is still maintained. [reflex-dom commits](https://github.com/reflex-frp/reflex-dom/commits/develop)
- Third-party JS such as CM6 has to be loaded into the page jsaddle-warp serves. Calls go through the jsaddle protocol, not a direct FFI, so FFI code written with wasm/JS-backend `foreign import javascript` does not run under jsaddle-warp unless it is written against jsaddle's API. That is an inference from how jsaddle works.
- Without warp you get a full cross-compile per change. Obelisk's `ob-run` is watch-and-rebuild, and GHCi reload is "not restored yet" in v2 (above).

### 1.4 Using CodeMirror 6 and Web Workers

- Neither the GHC JS-backend nor the wasm-backend docs describe importing npm ES modules directly. The wasm JSFFI does allow `await` inside async imports. [GHC wasm docs](https://ghc.gitlab.haskell.org/ghc/doc/users_guide/wasm.html), [GHC JS docs](https://ghc.gitlab.haskell.org/ghc/doc/users_guide/javascript.html)
- The practical pattern is an inference: bundle CM6 with esbuild into a small JS shim that exposes, say, `globalThis.tsEditor = { create, getDoc, onChange }`. Then call it through the FFI or jsaddle (`jsg "tsEditor" ^. js1 "create" el`), and feed CM6 `updateListener` callbacks into a reflex `Event` via `newTriggerEvent`.
- Web Worker: the test-runner worker can be a plain JS file. Haskell only needs `new Worker`, `postMessage`, `onmessage` and `terminate`, all ordinary DOM calls via jsaddle-dom/FFI. jsaddle-wasm can additionally move the whole Haskell app into a worker, but then synchronous DOM callbacks stop working. [jsaddle-wasm README](https://github.com/amesgen/jsaddle-wasm)

### 1.5 Maintenance signals (GitHub API, 2026-10-12)

| Repo | Last commit | Latest release |
|---|---|---|
| reflex-frp/reflex | 2026-10-10 | v0.9.4.0 (2025-10-20); Hackage 0.9.4.1 |
| reflex-frp/reflex-dom | 2026-10-12 | reflex-dom-core 0.8.1.4 (2025-05-15) |
| obsidiansystems/obelisk | 2026-10-11 | v2.0.0.0 (2026-10-10) |
| reflex-frp/reflex-platform | 2025-12-17 | v1.2.0.0 (2023-12-06) |
| ghcjs/jsaddle | 2026-08-02 | jsaddle 0.9.9.4 (Hackage) |
| amesgen/jsaddle-wasm | 2025-12-12 (fork haskell-wasm/jsaddle-wasm 2026-09-13) | 0.1.2.1 (2025-07-10) |
| haskell-wasm/ghc-wasm-meta | 2026-10-12 | n/a |

The work is active but concentrated in a few maintainers (Obsidian Systems: alexfmpe, ymeister, ali-abrar). The reflex-dom wasm issue [#490](https://github.com/reflex-frp/reflex-dom/issues/490) said in 2025 that "with somewhat limited amount of time on most of our maintainers hands it's unknown when it would actually be implemented". Wasm has since landed via Obelisk v2.

---

## 2. PureScript

### 2.1 Compiler and tooling

- `purs` 0.15.16 was released 2026-03-15, and 0.15.17-0 (pre-release) on 2026-06-07. [purescript releases](https://github.com/purescript/purescript/releases)
- Since 0.15, purs emits **ES modules** and FFI files are ES modules. A foreign module can `import … from 'pkg'` directly. FFI is annotated `/* #__PURE__ */` for bundler dead-code elimination. `purs bundle` was removed in favour of esbuild, webpack or parcel. [v0.15.0 release notes](https://github.com/purescript/purescript/releases/tag/v0.15.0), [FFI guide](https://github.com/purescript/documentation/blob/master/guides/FFI.md)
- **Spago 1.0.x** (1.0.4, 2026-03-30; commits 2026-10-10) uses the package registry and `spago.yaml`. `spago bundle` is "a good-defaults wrapper into esbuild" (`--minify`, `--source-maps`, `--platform browser`). Spago "dropped support for the --watch flag"; the README suggests `watchexec`. Packages outside the package set can be pulled with `extraPackages` (git + ref + subdir). [spago README](https://github.com/purescript/spago#readme)
- `purs-backend-es` is an optional optimizing backend. It claims "20-25% improvement in minified bundle size", and its last release is v1.4.2 (2023-09-11). [purescript-backend-optimizer README](https://github.com/aristanetworks/purescript-backend-optimizer)
- The whole toolchain installs from npm (`npm i -D purescript spago esbuild`). No Nix is needed. I verified this locally.

### 2.2 UI libraries

**Deku (with Hyrule): FRP-flavoured, no virtual DOM**
- Deku describes itself as "A PureScript web framework for apps that need to be fast". Components are `Nut`s built from Hyrule `Event`/`Poll` streams and hooks (`useState`, `useDyn`). It supports SPA, SSR and hydration. [Deku README](https://github.com/mikesol/purescript-deku). Hyrule is its FRP core (`FRP.Poll`, `FRP.Event`). [Hyrule](https://github.com/mikesol/purescript-hyrule)
- Release state:
  - Deku v0.12.2 came out 2026-04-10 (one bug fix). Before that, v0.12.1 was released 2024-08-11.
  - Recent commits: 2026-04-10 and 2026-03-13 (two community fixes), then 2025-03-15.
  - Hyrule's last commit is 2024-09-04, and its last release is v2.5.2 (2024-08-07).

  [deku commits](https://github.com/mikesol/purescript-deku/commits/main), [hyrule releases](https://github.com/mikesol/purescript-hyrule/releases)
- **Registry gap**:
  - The PureScript registry's newest `deku` is 0.9.24 (2023-06-18), and its newest `hyrule` is 2.4.0. The 0.12 split packages (`deku-core`, `deku-dom`, `deku-spa`) are **not in the registry**. [registry metadata/deku.json](https://github.com/purescript/registry/blob/main/metadata/deku.json), [metadata/hyrule.json](https://github.com/purescript/registry/blob/main/metadata/hyrule.json)
  - The current package set 81.4.0 (2026-10-09) contains deku 0.9.24. [package-sets/81.4.0.json](https://github.com/purescript/registry/blob/main/package-sets/81.4.0.json)
  - The official guide says it "works for Deku version 0.12.0 onwards" yet tells you to `spago install deku`, which would fetch 0.9.24. [Deku guide](https://deku-documentation.vercel.app/)
  - The guide's own source pulls deku-core from git via `extraPackages`, and its last push was 2024-08-11. [deku-documentation spago.yaml](https://github.com/mikesol/deku-documentation/blob/main/spago.yaml)
  - I confirmed that 0.12.2 builds against package set 81.4.0 using git `extraPackages` (deku-core, deku-dom, deku-spa @ v0.12.2, hyrule @ v2.5.2, tldr @ 7945d3f). See [Measurements](#measurements-local-2026-10-12).
- It is mostly a one-maintainer project (Mike Solomon), with 156 stars.

**Halogen: component and virtual-DOM architecture (not FRP)**
- Halogen is "a type-safe library for building user interfaces". It uses components with state and actions, or a single Elm-like component, over its own virtual DOM. Its README claims "performance and bundle sizes are roughly equivalent to popular JavaScript UI libraries like React". [Halogen README](https://github.com/purescript-halogen/purescript-halogen)
- **v7.1.0 was released 2026-10-11/12**, the first release since v7.0.0 (2022-05-02). It adds pointer events, `onBeforeInput`, `mapState`/`mapHalogen`, and a finalizer fix, and migrates to registry-backed Spago. [v7.1.0 release](https://github.com/purescript-halogen/purescript-halogen/releases/tag/v7.1.0). It is already in the registry (published 2026-10-12) but not yet in package set 81.4.0, which still has 7.0.0. [registry metadata/halogen.json](https://github.com/purescript/registry/blob/main/metadata/halogen.json)
- It is the most widely used PureScript UI library (1,598 stars) and is maintained under the purescript-halogen org.
- For third-party DOM widgets, Halogen's standard tools are refs (`HP.ref`, `H.getHTMLElementRef`) and `H.subscribe` emitters (halogen-subscriptions 2.0.1, published 2026-10-12). This makes CM6 a "black-box" component that Halogen does not re-render. That is an inference from the API. [Halogen docs](https://purescript-halogen.github.io/purescript-halogen)

**Others considered**
- **Specular** is FRP whose "API and DOM interaction is heavily inspired by Reflex and Reflex-DOM" (`Dynamic`, `Event`, a monadic widget builder), making it the closest to reflex-dom in PureScript. [Specular README](https://github.com/restaumatic/purescript-specular). It is not current in the registry, though: the newest there is 0.12.1 from 2021. It is absent from package set 81.4.0. The last commit is 2025-08-18 ("v0.14.1 → v0.14.2"), and the last GitHub release is v0.13.5 (2024-04-12). [registry metadata/specular.json](https://github.com/purescript/registry/blob/main/metadata/specular.json). Using it means a git `extraPackages` pin.
- **Flame** (Elm-architecture, not FRP) had its last commit 2026-08-26 and release v1.6.0 (2025-09). [purescript-flame](https://github.com/easafe/purescript-flame)
- **Elmish** (Elm-architecture over React) had release v0.15.2 on 2026-08-30. [purescript-elmish](https://github.com/collegevine/purescript-elmish)
- **react-basic-hooks** (React hooks) had v9.1.1 on 2026-04-09. [react-basic-hooks](https://github.com/purescript-react/purescript-react-basic-hooks)
- **Concur** (last commit 2024-12) and **purescript-behaviors** (archived) look dormant. [concur-react](https://github.com/purescript-concur/purescript-concur-react), [behaviors](https://github.com/paf31/purescript-behaviors)

### 2.3 Using CodeMirror 6 and Web Workers

- A foreign module `Editor.js` can directly `import { EditorView, basicSetup } from "codemirror"` and `export const create = (el) => () => new EditorView({...})`. esbuild (`spago bundle`) resolves the npm import. This follows from purs emitting ES modules and the FFI rules in [v0.15.0 notes](https://github.com/purescript/purescript/releases/tag/v0.15.0) and the [FFI guide](https://github.com/purescript/documentation/blob/master/guides/FFI.md). There is no separate shim bundle and no protocol layer.
- Workers: the registry has `web-workers` 2.0.1 (published 2026-10-10). [registry metadata/web-workers.json](https://github.com/purescript/registry/blob/main/metadata/web-workers.json). Alternatively, a 3-function FFI around `new Worker`, `postMessage` and `terminate` works. The worker itself can stay plain JS, bundled separately by esbuild.

---

## Measurements (local, 2026-10-12)

These come from a minimal counter app (one button, one number), built with `spago bundle --minify` (esbuild) and purs 0.15.16, against package set 81.4.0. Gzip used `-9`.

| Build | Minified | Gzipped |
|---|---|---|
| Halogen 7.0.0 counter | 75.0 KB | 18.0 KB |
| Deku 0.12.2 counter (git `extraPackages`) | 72.4 KB | 18.2 KB |
| CM6 alone: `codemirror` 6.0.2 `basicSetup` + `@codemirror/lang-javascript` 6.2.5, esbuild ESM minified | 505 KB | 170 KB |

For comparison, these are published GHC JS-backend figures, not from my own builds:
- Hello world: 387 KB–5.5 MB after Closure ADVANCED, about 74–182 KB brotli. [Haskell blog](https://blog.haskell.org/report-of-js-code-minification/)
- One Reflex app: about 3.3 MiB after Closure ADVANCED. [Discourse](https://discourse.haskell.org/t/ghc-js-backend-improve-compiled-size/12098)

I found no figure for a reflex-dom wasm bundle. CM6 dominates the PureScript bundle; reflex-dom (JS or wasm) would be a payload of several hundred KB to MB on top of CM6. The "several hundred KB to MB" part is an inference for wasm, and is consistent with the JS-backend figures.

---

## Trade-offs

- **FRP fidelity.** reflex-dom is the reference: higher-order FRP with `Event`, `Behavior` and `Dynamic`, and a monadic DOM builder. Specular is the closest PureScript clone, but it is barely published. Deku/Hyrule is FRP-ish: push-based `Event`/`Poll` with hooks, and a different idiom from Reflex. Halogen is not FRP.
- **Toolchain risk.**
  - reflex-dom means a tech-preview wasm backend (or a developer-preview JS backend), an "early stage" jsaddle-wasm, unreleased reflex-dom changes, and an Obelisk rewrite that is two days old.
  - PureScript means npm-only tooling and a stable compiler. But Deku 0.12 sits outside the registry (git pins), and Hyrule has had no commits since 2024.
- **Dev loop.**
  - reflex-dom: jsaddle-warp gives GHCi-speed reload, but third-party JS (CM6) runs over a WebSocket protocol. Native cross-compiles are slow, and Obelisk v2 hasn't yet restored hot reload.
  - PureScript: incremental `purs` compile plus esbuild, with a watcher like `watchexec`.
- **CM6 interop.**
  - PureScript FFI files *are* ES modules that import npm packages directly.
  - Haskell needs a pre-bundled global shim plus `foreign import javascript` or jsaddle calls. The two FFI styles (backend JSFFI vs jsaddle) also differ between dev (warp) and prod.
- **Size.**
  - PureScript framework overhead is about 18 KB gz, small next to CM6's 170 KB gz.
  - reflex-dom over the JS backend is multi-MB before Closure; the wasm size is unmeasured.
- **Maintenance.**
  - Reflex: an active small core team (Obsidian).
  - Halogen: an active org, with a fresh release.
  - Deku/Hyrule: a single maintainer with sporadic fixes.

## Comparison

| Criterion | reflex-dom (wasm via jsaddle-wasm) | reflex-dom (GHC JS backend) | reflex-dom (legacy GHCJS 8.10) | Deku 0.12 + Hyrule | Halogen 7.1 | Specular |
|---|---|---|---|---|---|---|
| FRP model | Full Reflex | Full Reflex | Full Reflex | Event/Poll + hooks | None (components/actions) | Reflex-like |
| Compiler status | Tech preview | Developer preview | Frozen (8.10) | Stable (purs 0.15.16) | Stable | Stable |
| Build | ghc-wasm-meta + cabal (or Obelisk v2, Nix) | ghcup/emscripten + cabal (or Obelisk v2) | reflex-platform, Nix, 16 GB RAM | npm + spago + esbuild | npm + spago + esbuild | npm + spago + git pin |
| Fast dev loop | jsaddle-warp (native GHC) | jsaddle-warp | jsaddle-warp | purs incremental + watcher | same | same |
| CM6 FFI | Global JS shim + JSFFI/jsaddle | Global JS shim + FFI | Global JS shim + FFI | Direct ES `import` in FFI | Direct ES `import` in FFI | Direct ES `import` in FFI |
| Framework size (gz) | Unmeasured; no primary figure | Multi-MB raw; about 3.3 MiB after Closure (one app) | Similar or larger | About 18 KB (measured) | About 18 KB (measured) | Not measured |
| Registry/Hackage release | reflex-dom 0.8.1.4 (2025-05); wasm bits unreleased | Same | reflex-platform v1.2.0.0 (2023) | Not in registry (git pin) | 7.1.0 (2026-10-12) | Registry 2021; git pin |
| Maintenance | Active, small team | Active, small team | Legacy | One maintainer, sporadic | Active org | Low activity |
