# Research: do blob workers inherit a meta-tag CSP?

Type: research
Status: resolved
Blocked by: 13

## Question

The game is hosted on GitHub Pages, which can't set response headers, so the Content-Security-Policy that stops player code from reaching the network must come from a `<meta http-equiv="Content-Security-Policy">` tag in the page. The test-runner worker would be started from a `blob:` URL so it inherits the page's policy instead of taking one from its own response.

In current Chrome, Firefox and Safari (desktop and iOS), does a module Web Worker created from a `blob:` URL inherit a policy delivered by a meta tag, so that `connect-src 'none'` blocks `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts`/dynamic `import()` inside it? Cite the specs (CSP3, HTML policy containers) and browser bug trackers, and list what a meta-tag policy can't do that matters here. Also: does a meta-tag CSP get in the way of the Obelisk wasm frontend itself (e.g. needing `'wasm-unsafe-eval'`), and what is the minimal policy that lets the game run while blocking the worker's network?

## Comments

Findings: ../research/blob-worker-csp.md (on branch research/blob-worker-csp)

- Spec: a meta-tag policy goes into the page's policy container, and a `blob:` worker (classic or module) gets a copy of the container of the page that created the blob URL (HTML "create a policy container from a fetch response").
- Chrome 155: verified by WPT (`worker-from-guid`: meta + blob worker + `connect-src`) and measured locally. A module blob worker under a meta tag had `fetch`, XHR, `WebSocket` and `EventSource` blocked. Firefox 157 passes the same WPT test, but wasn't measured locally.
- Safari: WebKit's source starts blob workers with the creating page's policy, meta ones included. Safari 27 fails the WPT test only because WebKit didn't fire violation events in workers until a 2026-09-28 fix, so the block itself isn't proven by a test. iOS is inferred to match.
- `connect-src` doesn't cover dynamic `import()`, which `script-src` controls (measured: it reached a cross-origin server under `connect-src 'none'`). `importScripts` always throws in a module worker.
- The wasm frontend downloads `frontend.wasm` with `fetch()`, so a page-wide `connect-src 'none'` stops the game loading. `'wasm-unsafe-eval'` is needed only if `script-src` is set, and then the runner's `new Function` and jsaddle's `eval` need `'unsafe-eval'` anyway.
- Today `startCheck` creates the worker from the URL `js/runner.js`, not a blob, so the page's meta policy wouldn't reach it.

## Answer

The browsers do pass the page's meta-tag rules on to a worker started from a `blob:` URL:
- **Chrome/Edge:** yes, verified.
- **Firefox:** yes, per WPT.
- **Safari, macOS and iOS:** yes according to WebKit's source, but not yet proven by a test.

`connect-src 'none'` can't go on the whole page, because the game itself fetches `frontend.wasm`. These all work:
- **Smallest:** `connect-src 'self'`. It blocks the worker's cross-origin fetch, XHR, WebSocket and EventSource, and needs no extra keywords. Same-origin requests and `import()` still get through.
- **Also blocks `import()`:** add `script-src 'self' 'unsafe-eval' blob:`. `'unsafe-eval'` also covers wasm, so `'wasm-unsafe-eval'` alone isn't enough: the runner's `new Function` needs `'unsafe-eval'`.
- **Blocks same-origin too:** have the page add a second meta tag with `connect-src 'none'` after the wasm loads (checked in Chrome only).

Either way, the worker must be created from a blob URL, which it isn't today. Full detail: ../research/blob-worker-csp.md
