# Research: Can a PureScript compiler run in the browser?

Ticket: [01-research-purescript-in-browser](../issues/01-research-purescript-in-browser.md). Researched 2026-10-26. Primary sources only (the PureScript and Try PureScript repos, the acorn README), checked against the repos' default branches on that date.

## Plain-language answer

**No. I found no maintained way to run the PureScript compiler inside a browser.** The compiler (`purs`) is a Haskell program shipped only as native programs for Linux, Mac and Windows. Try PureScript, the official "PureScript in the browser" site, does not compile in the browser at all: the page sends your code to a server (`compile.purescript.org`), the server compiles it, and the browser gets JavaScript back.

The only in-browser attempt I found is a 2020 half-finished experiment (`purjs`) with no readme, one commit and no later work.

So for Type Solution, "compile and check entirely in the player's browser on GitHub Pages" is **not achievable with anything that exists today**. The questions about download size, start-up, memory, per-compile time and a 400 ms check therefore have **no measured answer**: there is nothing to measure. I did not run the compiler locally either (the sandbox refused to run a downloaded binary and to post test code to the public server), so I give no timing figures rather than invent them.

A different design is possible; see "What this means for the map".

## 1. Which browser-hostable compilers exist, and which is maintained

| Candidate | What it is | Browser-hosted? | Maintained? |
|---|---|---|---|
| `purescript/purescript` (`purs`) | The compiler, in Haskell. Latest release v0.15.16 (2026-03-15), a v0.15.17-0 pre-release (2026-06-07); repo pushed to on 2026-10-21. | No. Releases are native binaries only: linux64, linux-arm64, macos, macos-arm64, win64 (tarballs of 10 to 23 MB). | Yes |
| `purescript/trypurescript` (try.purescript.org) | Editor page plus a small Haskell web server that wraps `purs`. Last push 2026-07-05. | No. The browser edits and runs; compiling happens on the server. | Yes |
| `TheMatten/purjs` | "WIP wrapper for running purescript compiler in browser" (GitHub description). `default.nix` uses reflex-platform's GHCJS shell; the cabal file pins `base ^>=4.12` (GHC 8.6 era). | Aimed at it; no evidence it ever worked: no readme, one commit "Initial commit", last push 2020-10-10, 9 stars. | No |
| `purs-wasm` org (`purescript-backend-wasm`) | A backend that compiles PureScript programs to WebAssembly. | No. It concerns the output of PureScript, not running the compiler in a browser. | n/a |

Sources:
- [purescript releases](https://github.com/purescript/purescript/releases) (v0.15.16 asset list) and [INSTALL.md](https://github.com/purescript/purescript/blob/master/INSTALL.md): "Each release comes with prebuilt x86-64 binary bundles for Linux, mac OS, and Windows. Users of other operating systems or architectures will likely need to build the compiler from source."
- [trypurescript README, "Server API"](https://github.com/purescript/trypurescript#server-api): "The server is a very basic web service which wraps the PureScript compiler ... hosted at https://compile.purescript.org/."
- [purjs repo](https://github.com/TheMatten/purjs), [purjs.cabal](https://github.com/TheMatten/purjs/blob/master/purjs.cabal), [default.nix](https://github.com/TheMatten/purjs/blob/master/default.nix).
- [purs-wasm org](https://github.com/purs-wasm).
- Searches of the purescript/purescript issue tracker for "ghcjs", "wasm", "browser compiler" and "WebAssembly" return only unrelated or old issues. The one WebAssembly issue, [#1177 "Compile to WebAssembly"](https://github.com/purescript/purescript/issues/1177), is about a code-generation target, not running the compiler. I found no open issue or doc that plans a browser build of `purs`.

Technical detail on why a browser build is hard: `purs` uses Template Haskell (`template-haskell`, `file-embed`) and depends on `process`, `directory`, `Glob`, `haskeline` and `network` ([purescript.cabal](https://github.com/purescript/purescript/blob/master/purescript.cabal)). A port would need GHC's JavaScript or WebAssembly backend to build all of that. I found no primary source saying anyone has done it for the current compiler. That is a gap in what I found, not proof that it cannot be done.

## 2. Size, start-up, per-compile latency, memory

Not measurable in a browser, since no browser build exists. The nearest first-party facts:

- **Compiler size**: the native bundles are 10.5 MB (macos x86-64) to 23 MB (linux-arm64) as gzipped tarballs ([release assets](https://github.com/purescript/purescript/releases/tag/v0.15.16)). A browser build is not guaranteed to be smaller; treat as an order of magnitude only.
- **How Try PureScript keeps compiles fast**: at start-up the server compiles all libraries once and keeps their type information (the "externs") in memory. Each request then rebuilds only the one `Main` module, with no cache and almost no disk writes ([server/Main.hs](https://github.com/purescript/trypurescript/blob/master/server/Main.hs): `buildMakeActions`, `Make.rebuildModule'`). It rejects input over 20,000 characters. A browser version would have to copy this design; it shows the start-up cost is paid once, not per check.
- Memory and timings: no primary source publishes any. Not measured.

## 3. What the compiler needs alongside it, and how it is served statically

The compiler needs the type information (externs) of every library the Solution imports, starting with `Prelude`. In Try PureScript these live in the server's memory, not on the client. The client downloads only the compiled JavaScript of libraries it runs, as separate files at `https://compile.purescript.org/output/<Module>/index.js` and `foreign.js`. Sample sizes, uncompressed, fetched 2026-10-26: `Prelude/index.js` 3.7 KB; `Data.Array/index.js` 52.9 KB plus `foreign.js` 8.0 KB; `Data.Foldable/index.js` 35.1 KB.

Sources: [trypurescript README](https://github.com/purescript/trypurescript#server-api) ("GET /output/:module/(index.js|foreign.js)"), [Try client config](https://github.com/purescript/trypurescript/blob/master/client/src/Try/Config.js).

Serving the library output statically is easy (plain files). The compiler's own input (externs) is not available in a browser-ready form.

## 4. What the output is, and whether it can run in a Web Worker under the no-network CSP

- **Format**: since PureScript 0.15 the compiler emits **ES modules** (`import` / `export`), no longer CommonJS ([CHANGELOG: "Switch from Common JS to ES modules (#4232)"](https://github.com/purescript/purescript/blob/master/CHANGELOG.md)). Foreign (hand-written JS) code must also be ES modules.
- **Try's response**: `POST /compile` returns `{ "js": "...", "warnings": [...] }` ([README](https://github.com/purescript/trypurescript#server-api)). Try's client had to be reworked for ES modules; see [trypurescript issue #263](https://github.com/purescript/trypurescript/issues/263) (proposed SystemJS plus import maps).
- **Worker and CSP**: running the output means loading `Main` plus every imported library module. A classic worker started from a script file cannot use `import` (it would need to be a module worker), and the CSP forbids network. So Type Solution would have to pre-bundle the needed library modules into one same-origin script. This is a design question, not a blocker; I did not test it. See also [blob-worker-csp.md](../../type-solution/research/blob-worker-csp.md) for the worker and CSP side.

## 5. Licences

- Compiler `purs`: BSD-3-Clause ([purescript.cabal](https://github.com/purescript/purescript/blob/master/purescript.cabal) `license: BSD-3-Clause`; the LICENSE file also lists dependencies' licences, which is why GitHub shows "NOASSERTION").
- Try PureScript: BSD-3-Clause ([repo](https://github.com/purescript/trypurescript)).
- `purescript-prelude`: BSD-3-Clause (GitHub licence detection).
- `purjs`: BSD-3-Clause.

None blocks bundling into a static site; BSD-3 asks that the copyright notice and licence text be kept.

## 6. What a compile error looks like, compared with acorn's

PureScript (the compiler's `--json-errors` format, which Try's server returns unchanged): a list of objects with `message` (multi-line human text), `errorCode` (for example `TypesDoNotUnify`), `errorLink` (a docs URL), `filename`, `moduleName`, `position` = `{ startLine, startColumn, endLine, endColumn }`, an optional `suggestion` (replacement text and range), and `allSpans`. There can be several errors per compile, and syntax errors use the same shape as type errors. Sources: [Errors/JSON.hs](https://github.com/purescript/purescript/blob/master/src/Language/PureScript/Errors/JSON.hs); decoded by Try's client in [Try/API.purs](https://github.com/purescript/trypurescript/blob/master/client/src/Try/API.purs).

acorn: one thrown `SyntaxError` with a short `message`, plus `pos`, `raisedAt` and `loc = { line, column }` ([acorn README](https://github.com/acornjs/acorn/blob/master/acorn/README.md)). Syntax only; no type checking.

Differences that matter: PureScript gives a range (start and end) rather than a point, an error code, possibly several errors, and long multi-line messages rather than one line. I did not verify whether `startColumn` is one-based or zero-based; check before wiring it up.

## 7. Can a ~400 ms edit-pause check be realistic?

Not with a browser-hosted compiler, because none exists. With a server, Try's design makes the compile itself cheap (only `Main` is rebuilt), but a network round trip adds delay I cannot promise, and it breaks the map's rules (no server-side checking, static deploy, no-network CSP). I could not time it. No latency figure is claimed.

## What this means for the map

1. The map's premise (compile in the player's browser, static deploy) has no existing path for PureScript. The options are:
   - **Build a browser compiler ourselves** by building `purs` with GHC's WebAssembly or JavaScript backend. No primary source shows this working; it is a research project of its own.
   - **Use a server** (a Try-PureScript-style compiler). The map already rules this out.
   - **Skip compiling in the browser**: precompile each Puzzle's Reference Solution and check typed text some other way. This loses real checking of what the player types, so it probably misses the goal.
   - **Pick a Language that already has a browser implementation**, which would reshape "PureScript first".
2. "Syntax errors" and "Check latency" in the map's "Not yet specified" cannot be settled for PureScript until one option is chosen.
3. Tickets 02 and 03 (JSON tests, editor support) should know this before assuming a browser compiler.

## Gaps

- No local run of `purs` (the sandbox denied running a downloaded binary) and no timing of the hosted server (denied posting test code to a public service). All size figures are published file sizes or design facts; no timings of mine.
- I did not exhaustively rule out unofficial or recent community projects outside the PureScript and Try repos. GitHub searches for browser, wasm and ghcjs compilers returned only the items in the table.
- Whether the JSON error `startColumn` is one-based or zero-based was not verified.
