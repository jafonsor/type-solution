# Research: sandboxing player JavaScript in the browser

Type: research
Status: resolved

## Question

What's the best in-browser way to run untrusted player JavaScript against hidden tests on every typing pause? Compare a Web Worker with a sandboxed iframe (and anything else credible, e.g. ShadowRealm or a QuickJS-wasm interpreter) on: killing infinite loops and enforcing timeouts, the cost of terminating and re-spawning, isolation from the page and its storage, how a test harness passes in the Solution and gets results back, and the round-trip delay.

## Comments

Findings: ../research/js-sandbox.md

- Suggested approach: a module Web Worker from a Blob URL. Use a fresh worker for each evaluation, keep one pre-spawned spare, and call `terminate()` on timeout (~1 s) or when a newer run replaces it.
- `terminate()` stops `while(true){}` at any time. Respawn took ~5–17 ms median and a warm round trip took <0.1 ms (measured in Chrome 154).
- Sandboxed iframes have the best storage isolation but fail on infinite loops: in Chrome, a replacement frame was blocked until the runaway loop ended.
- ShadowRealm (Stage 2.7, same thread) and SES can't stop infinite loops. QuickJS-wasm can, but adds ~1 MB.
- Lock down the network with a page CSP `connect-src` header, which Blob workers inherit. Get syntax-error positions from acorn, and runtime lines from `//# sourceURL` minus the 2-line `new Function` header.

## Answer

Run each check in a fresh module Web Worker from a Blob URL, with one pre-spawned spare. `terminate()` on a ~1 s timeout or when superseded by a newer check. CSP `connect-src 'none'` blocks network, and the harness shadows storage globals. Use acorn to find syntax errors, and `//# sourceURL` for runtime line numbers. Sandboxed iframes can't recover from busy loops, ShadowRealm isn't shipping, SES can't stop loops, and QuickJS-wasm adds about 1 MB. Benchmarked in Chrome only. Full detail: ../research/js-sandbox.md
