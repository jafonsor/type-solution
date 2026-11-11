Type: research
Status: resolved
Blocked by: none

# 01: Can a PureScript compiler run in the browser?

## Question

Can a Solution typed in PureScript be compiled and checked entirely in the player's browser, on a static GitHub Pages deploy?

Find, from primary sources (the PureScript repo and docs, Try PureScript, package registries):
- Which browser-hostable PureScript compilers or toolchains exist (the compiler built to JS, Try PureScript's setup, anything newer), and which is maintained.
- Their download size, start-up time and per-compile latency, a typical small function's compile time, and the memory use.
- What they need alongside the compiler (the Prelude and other package externs/sources) and how that is served statically.
- What the output is (CommonJS or ES modules), and whether it can run in a Web Worker started from a script file with the existing no-network CSP.
- Licences.
- What a compile error looks like (message, line and column), compared with acorn's.
- Whether any option makes a ~400 ms edit-pause check realistic.

Capture the findings under `.scratch/other-languages/research/`.

## Answer

No maintained, browser-hostable PureScript compiler exists. The compiler (`purs`) ships only as native Linux, Mac and Windows binaries; Try PureScript compiles on a server (`compile.purescript.org`) and sends JavaScript back. The only in-browser attempt (`purjs`, GHCJS, 2020) is an abandoned one-commit experiment. So compiling on a static GitHub Pages deploy is not possible today without building `purs` for WebAssembly or JavaScript ourselves, or using a server (out of scope in the map). Output is ES modules; errors are a JSON list with line/column ranges and codes. No size, latency or memory figures were measured, as there is nothing to run in a browser. Full findings: [research/01-purescript-in-browser.md](../research/01-purescript-in-browser.md).
