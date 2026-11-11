Type: research
Status: resolved
Blocked by: none

# 07: Can purs be built for the browser?

## Question

[Research 01](01-research-purescript-in-browser.md) found no maintained browser build of the PureScript compiler (`purs`), and no primary source showing anyone has built the current compiler with GHC's WebAssembly or JavaScript backend. [Ticket 06](06-grilling-checking-without-browser-compiler.md) chose to try that port before any fallback. Decide, from evidence, whether the port is feasible enough to plan around:
- What is the current state of GHC's WebAssembly and JavaScript backends (versions, Template Haskell, `process`/`directory`/`network` dependencies), and which of `purs`'s dependencies are known blockers?
- Can the repo's existing Haskell-to-WASM build be reused? Can `purs` (or just the type-checking and JavaScript-generating part, without the command line) be built that way? A time-boxed build attempt on a throwaway branch is allowed.
- If it builds: rough size (gzipped), start-up time, memory, and time to check one small `Main` module against `Prelude` externs, measured, not guessed.
- Will the compiler's input (externs of the libraries a Solution imports) be shippable as static files, and how big is that?
- Does a prior port of a similar Haskell compiler (for example, other compilers reported running in a browser via GHC's backends) exist that suggests a route?

Output: findings file under `research/`, and a plain-language verdict: feasible / feasible with caveats / not feasible, with the evidence.

## Answer

Resolved 2026-10-27 by a research subagent; findings in [research/07-purs-browser-port.md](../research/07-purs-browser-port.md).

**Verdict: feasible with caveats.** A real porting project, not finished in the time box; no `purs` build completed, so size, start-up, memory and check time are all unmeasured.

- The repo's dev shell already has `wasm32-wasi-ghc` 9.14 and Template Haskell works on it. The cabal solver planned `purs` v0.15.16 only with `allow-newer: all`; `purs` pins GHC 9.8-era versions on purpose, so a faithful port may want the 9.8 wasm flavour.
- Blockers hit are at the edges: `basement` (via `crypton`/`memory`, used only for cache hashing, so droppable), `network` (via the logger), `cborg` 0.2.10.0 on 32-bit (needs git master; externs are CBOR), `cheapskate` (patched), `happy` (pre-generated parser). `process`, `haskeline`, REPL, ide and publish were not reached.
- The right shape is a small library-only wasm core driving `Make.rebuildModule'` with in-memory actions, as Try PureScript's server does, not the `purs` command line.
- Externs are static `externs.cbor` files per module, so shippable as fingerprinted static files; their size is unmeasured.
- The JS backend needs hand-written replacements for every C import; wasm is the lower-risk route. Prior art: Agda and GHC itself run on the wasm backend; no source shows `purs` ported.
- The default wasm flavour links LGPL `gmp`; the `native` flavour avoids it.
