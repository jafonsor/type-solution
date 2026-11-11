Type: task
Status: resolved
Blocked by: none

# 11: Run the PureScript wasm module in a browser web worker

## Question

[Ticket 10](10-task-build-purs-wasm.md) measured `purs-core.wasm` under Node's WASI on a real disk. Repeat the measurement in a real browser web worker on the app page: load the module, give it a WASI shim (for example `browser_wasi_shim`) with an in-memory filesystem holding the Prelude externs (and one more library, such as `arrays`) as static files, check one small `Main`, and read back errors and the generated JavaScript.

Record, as the answer: cold and warm check times, start-up with the fetch separated from compile, memory, brotli size after `wasm-opt`/strip if available, whether the generated JavaScript runs in the existing Solution sandbox, and what had to change in `purs-core`. Feeds [ticket 12](12-grilling-check-latency-and-syntax-errors.md).

This ticket does, rather than decides; confirm with the user before starting.

## Answer

**Plain version: it works in a real browser.** The PureScript compiler ran inside a web worker in Chrome (Playwright-driven, Apple-silicon Mac, local static server). It checked a small `Main`, reported both a type error and a syntax error in readable text, and the JavaScript it produced ran in the same worker. Speeds match Node, so the 400 ms edit pause from ticket 10 holds.

**Setup.** `@bjorn3/browser_wasi_shim` 0.4.2 with an in-memory filesystem holding Prelude v6.0.3 sources, their `.js` foreign files and the cached externs (229 files, 1.24 MB raw), fetched as static files. The same unmodified `purs-core.wasm` from [ticket 10](10-task-build-purs-wasm.md) (the `gmp` build). Harness: [research/11-browser-worker/](research/11-browser-worker/) (`worker.src.js`, `drive.mjs`, `index.html`; the wasm and Prelude files are the ticket 10 artifacts, not copied here).

| What | Chrome worker |
|---|---|
| Fetch wasm (local server, 23.6 MB raw) | 60 to 135 ms (network on GitHub Pages not measured) |
| `WebAssembly.compile` | 30 to 45 ms |
| Fetch 229 library files (local) | 65 to 85 ms; building the in-memory tree 1 ms |
| Instantiate per check | 3 to 9 ms (a fresh instance per check; the filesystem persists) |
| Check, nothing changed | 190 to 230 ms |
| Check, `Main` edited | 290 to 395 ms |
| Check with a type error / syntax error | 190 to 270 ms, exit 1, text below |
| Cold, no cached externs (builds all 50 Prelude modules) | 3.38 s |
| Memory (wasm linear memory) | 19 to 22 MB |
| Size | 23.6 MB raw, 3.46 MB gzip -9, 2.28 MB brotli -q 11; `wasm-opt` and `wasm-strip` not installed, so no tuned figure |

**Errors.** The compiler's pretty-printed text arrives on stdout with ANSI colour codes, a file path in the shape `/w/src/Main.purs:45:7 - 45:13`, and a link to the PureScript docs. A type error reads "Could not match type String with type Int ... in value declaration bad". A syntax error reads "Unable to parse module: Unexpected or mismatched indentation" at line 46, column 1 (the line after the broken one, not the broken one). Parsing the line and column and stripping the colour codes is straightforward; this is the input to [ticket 12](12-grilling-check-latency-and-syntax-errors.md).

**Generated JavaScript.** 51 modules (`Main` plus Prelude) as ES modules with relative `import ... from "../Data.Show/index.js"`; foreign modules are `foreign.js`. They ran in the worker after linking every module as a blob URL with the import paths rewritten (import and call: 7 ms; `older({name:"a",age:1})` returned age 2). Not tested: the real Solution sandbox and its CSP (see [ticket 15](15-grilling-csp-policy.md)), and the Run's test harness around it. What this shows is that no bundler is needed beyond a small blob linker (or a single-file bundle at build time).

**What had to change in `purs-core`.** Nothing; the wasm is byte-identical to ticket 10's. All work is on the JavaScript side.

**Two things the shim needed.**
- It reports a modified time of 0 for every file, so the compiler's timestamp check treated edited files as unchanged (a type error showed as "ok"). The fix is a `File` subclass that reports a modification time that moves when the code changes (6 lines). Without it the check silently misses edits.
- The shim logs every file open to the console unless debug is off; in the final app this is only noise.

**What is still unmeasured.**
- A second library such as `arrays`: only Prelude externs exist here. Externs size and load time grow with the library list ([ticket 13](13-grilling-compiler-bundle-build-and-deploy.md) fixed the list but it was not built).
- Cache Storage and real-network download time on GitHub Pages; low-end devices; other browsers (Firefox, Safari).
- The harness still reads and parses all 50 Prelude sources on every check (the 190 ms floor); an entry point that takes only externs would be faster. No change was needed for the latency to look fine, so this is optional tuning.
- Whether the 23.6 MB wasm should be shipped brotli-compressed by GitHub Pages: Pages serves gzip (3.46 MB), not brotli (2.28 MB), unless the app pre-compresses and decompresses itself.

**Effect on the map.** The browser run is confirmed, so the fallback fog is closed (kept only as a note: it returns if a later limit fails). [Ticket 12](12-grilling-check-latency-and-syntax-errors.md) is unblocked.
