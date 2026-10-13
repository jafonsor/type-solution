# Research: reflex-dom vs PureScript for an FRP frontend

Type: research
Status: resolved

## Question

How viable is each FRP option for a static single-page app that embeds CodeMirror 6? For **reflex-dom**: the state of GHC's JavaScript and wasm backends (and legacy GHCJS), build tooling and dev loop, bundle size, how to call JS libraries like CodeMirror 6 and Web Workers, and how actively it's maintained. For **PureScript**: its FRP-style UI libraries (Deku/Hyrule, Halogen, others) with the same criteria. Produce the facts the stack choice needs, not the choice itself.

## Comments

Findings: ../research/frontend-frp.md

- reflex-dom: Obelisk v2.0.0.0 (2026-10-10) now targets wasm by default, but GHC's wasm backend is still a tech preview, jsaddle-wasm is "early stage", and reflex-dom's wasm/9.14 support isn't on Hackage yet. The GHC JS backend output is multi-MB before Closure Compiler. The fast dev loop is jsaddle-warp. To use CM6 you need a pre-bundled global JS shim.
- PureScript: npm-only tooling (purs 0.15.16, spago 1.0 + esbuild). FFI files are ES modules, so they can import CM6 directly. A measured counter app is about 18 KB gzipped for both Deku and Halogen, compared with about 170 KB gzipped for CM6 itself.
- Deku 0.12 + Hyrule is the FRP-flavoured option, but it isn't in the registry (you need git pins) and has a single maintainer with sporadic activity. Halogen (not FRP) just shipped 7.1.0. Specular is a Reflex-like library, but it's barely published.

## Answer

Facts only, choice deferred to "Grilling: choose the frontend stack". reflex-dom is newly viable via Obelisk 2 (wasm), but the stack beneath it is preview-grade, large and has a slow dev loop. PureScript has lightweight npm tooling and direct CM6 FFI. Its FRP library (Deku+Hyrule) is thinly maintained and unregistered, while Halogen is healthy but not FRP. Full detail: ../research/frontend-frp.md
