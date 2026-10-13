# Research: running a player's Solution against hidden tests in the browser

Ticket: [../issues/03-research-js-sandbox.md](../issues/03-research-js-sandbox.md)
Date: 2026-10-12

## Question

What's the best in-browser way to run a Puzzle's hidden tests against the player's Solution on every typing pause? The Solution comes from the player and runs only in their own browser, so the risks are accidents: infinite loops, thrown errors, and changes to globals. Not attacks.

Compared on:
- stopping infinite loops and enforcing timeouts;
- how much it costs to kill and respawn, and to reuse a warm sandbox;
- isolation from the page, DOM, storage and network;
- how the test harness sends the Solution in and gets results back;
- round-trip delay;
- getting readable error messages.

## Sources and method

- Primary sources: MDN, the WHATWG HTML spec, ECMA-262, TC39 proposal repos, Chromium docs, and library READMEs. Each claim has its source inline.
- **Local measurements.** I wrote a throwaway benchmark page and ran it in headless Chrome 154 on macOS. It's in this session's scratchpad (`bench/bench.html`) and wasn't kept in the repo. Numbers marked **[measured]** come from it. I tried headless Firefox but couldn't get it to load the page, so **nothing here is measured in Firefox or Safari**.
- Timer resolution caps the warm numbers. Chrome's `performance.now()` is coarsened to about 0.1 ms when the page isn't cross-origin isolated ([MDN performance.now, "Reduced time precision"](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#security_requirements)).

## 1. Dedicated Web Worker (classic or module, created from a Blob URL)

**Killing infinite loops.**
- `worker.terminate()` "immediately terminates the Worker. This does not offer the worker an opportunity to finish its operations; it is stopped at once" ([MDN Worker.terminate](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate)).
- In the spec, the "terminate a worker" algorithm runs *in parallel* with the worker's event loop. It sets the closing flag, throws away queued tasks, and "abort[s] the script currently running in the worker" ([HTML §10.2.x terminate a worker](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker)). So it works even when the worker is stuck in `while(true){}`, because the main thread never has to wait for the worker to yield.
- **[measured]** A worker spinning in a 10 s busy loop did not block the page. The page's 10 ms `setInterval` ticked 20–24 times in 200 ms.
- **[measured]** Calling `terminate()` on that spinning worker, then starting a new worker that answered a ping, took **6.7 ms** in one run and **47 ms** in another.
- A timeout is therefore just `setTimeout(() => worker.terminate(), budget)` on the main thread.

**Cost of spawning, and of reusing a warm worker.** All **[measured]**, Chrome 154, 30 spawns, each including the first test job:

| Setup | median | p95 |
|---|---|---|
| Classic Blob worker, spawn + first job | 16.6–17.1 ms | 75–100 ms |
| Module Blob worker (`{type:"module"}`), spawn + first job | 4.7–9.9 ms | 16–23 ms |
| Warm worker, `postMessage` → run 3 tests → reply (200 runs) | <0.1 ms (below timer resolution) | 0.1 ms |

- Both are tiny next to a typing debounce of a few hundred ms. A warm worker is effectively free.
- The p95 of a cold spawn can reach tens of ms. That's why a pre-spawned spare is worth having.

**Isolation.**
- A worker has no DOM and no `window`: "You can't directly manipulate the DOM from inside a worker" ([MDN Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)).
- The same page says workers *can* use `fetch()`, XHR, WebSockets and IndexedDB.
- **[measured]** A Blob worker sees `indexedDB` and `caches` (both of type `object`), and `localStorage` is undefined.
- A Blob worker has the page's origin, so it can reach the app's own IndexedDB and Cache Storage. That's the one real gap for an app that stores Run history in IndexedDB.
- CSP: workers normally use the CSP from their own response headers. But "if the worker script's origin is a globally unique identifier (for example, if its URL has a scheme of data or blob)", the worker inherits the creator's CSP ([MDN Using Web Workers, CSP section](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy)).
- **[measured]** The page was served with `connect-src 'none'; worker-src blob:`. Inside a Blob worker, `fetch()` failed with `TypeError: Failed to fetch` and the server never saw the request.
- So a static site that can set a CSP header can cut workers off from the network with one directive. (`connect-src` limits `fetch`/XHR/WebSocket/EventSource. A WebSocket *constructor* still returns an object, and the connection is then blocked.)
- Caveat: `new Function`/`eval` go through `HostEnsureCanCompileStrings` ([ECMA-262 CreateDynamicFunction](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-createdynamicfunction)), which CSP controls. If the page's `script-src` leaves out `'unsafe-eval'`, the inherited policy also blocks `new Function` inside the worker. Either allow `'unsafe-eval'`, or put the Solution into the Blob source of the worker itself.
- Globals: whatever the Solution does to globals (for example, overwriting `Array.prototype.map`) lasts as long as that worker. A warm worker that gets reused carries those changes into the next run. A fresh worker per run does not.

**Passing data in and out.**
- `postMessage` copies data with the structured clone algorithm ("Data passed between the main page and workers is copied, not shared"), which handles more than JSON, including cycles ([MDN Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)).
- Functions and DOM nodes can't be cloned. The harness should send `{source, tests}` and return plain data.
- **[measured]** A harness that compiles the Solution with `new Function` and runs each test inside `try/catch` returned `{kind:"results", results:[{pass:true, got:3}, ...]}` as expected.

## 2. Sandboxed iframe (`sandbox="allow-scripts"`, `srcdoc`, `postMessage`)

**Isolation.** This is where the iframe is strongest.
- An empty `sandbox` attribute sets every sandboxing flag. Each keyword removes one ([HTML, parse a sandboxing directive](https://html.spec.whatwg.org/multipage/browsers.html#parse-a-sandboxing-directive)).
- Without `allow-same-origin`, the "sandboxed origin browsing context flag … forces content into an opaque origin" and "blocks access to localStorage" and `document.cookie` ([HTML, sandboxed origin flag](https://html.spec.whatwg.org/multipage/browsers.html#sandboxed-origin-browsing-context-flag)).
- MDN strongly discourages combining `allow-scripts` with `allow-same-origin`: together they let the frame remove its own sandbox ([MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)).
- **[measured]** Inside the frame, `localStorage`, `indexedDB.open`, `document.cookie` and `window.top.document` all throw `SecurityError`. A `fetch` to the app's own origin fails, because the frame is cross-origin to it.
- A `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'">` inside the `srcdoc` blocked fetch and still let the harness run **[measured]**.

**Passing data in and out.**
- Use `postMessage` with `targetOrigin "*"`, since an opaque origin can't be named as a target. Messages arrive with `event.origin === "null"`, so check `event.source === iframe.contentWindow` ([MDN Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)).
- **[measured]** Cold load (`srcdoc`) plus the first job: median 7.4–19.8 ms, p95 20–232 ms. Warm round trip: median 0.2–1.2 ms.

**Killing infinite loops. This is the weak point.**
- There's no `terminate()`. The only way to stop the frame is to remove it from the page or navigate it.
- On desktop, since Chromium 127.0.6483.0, sandboxed documents with opaque origins run in a separate process from their parent ([Chromium process model doc](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md)). On Android this happens only under Partial Site Isolation.
- **[measured]** With a frame busy for 1 s, the page stayed responsive (50 ticks at 500 ms).
- **[measured, important]** I sent a frame into an 8 s busy loop, removed it from the page, and created a new sandboxed `srcdoc` frame. The new frame did not become ready for **~7.8 s**, i.e. until the old loop finished on its own.
- The likely explanation is that a page's sandboxed frames share one process, so the replacement is queued behind the runaway script. This is my inference, not a documented guarantee.
- With a true `while(true){}`, the replacement frame would never become ready. So in Chrome a sandboxed iframe can't reliably recover from an infinite loop.
- On browsers or devices without this process split (Android without Partial Site Isolation, and Firefox and Safari, which I didn't test), the frame may run on the page's own thread. Then an infinite loop freezes the whole game. The HTML spec only groups windows into event loops per agent cluster ([HTML, agents and agent clusters](https://html.spec.whatwg.org/multipage/webappapis.html#agents-and-agent-clusters)). It doesn't promise that a cross-origin frame gets its own thread.

## 3. ShadowRealm

- Status: still **Stage 2.7** in the TC39 list ([tc39/proposals](https://github.com/tc39/proposals), [proposal repo](https://github.com/tc39/proposal-shadowrealm)). A Stage 3 request was presented in December 2024, but the proposal is still listed at 2.7. **[measured]** `typeof ShadowRealm === "undefined"` in Chrome 154.
- Even once it ships, it doesn't fit this job. The explainer says "Code runs synchronously in the same thread", and lists availability/DoS protection as a non-goal ([explainer](https://github.com/tc39/proposal-shadowrealm/blob/main/explainer.md)). An infinite loop would hang the page, and nothing could interrupt it.
- It does give each realm fresh built-ins, so prototype changes stay inside the realm. Only primitives and callables cross the boundary.

## 4. SES / Compartments (Endo)

- `lockdown()` freezes the shared built-ins, and each `Compartment` gets its own `globalThis` with no ambient authority such as `fetch` ([endojs/endo `packages/ses`](https://github.com/endojs/endo/tree/master/packages/ses)).
- The README says outright that guest code can "execute for an indefinite amount of time" and "allocate arbitrary amounts of memory", and that "every compartment shares one JavaScript agent".
- So it has no way to stop an infinite loop. `lockdown()` also freezes the built-ins in the host realm, which brings in the "override mistake" for app code.
- It's useful only inside a worker, as an extra layer. It can't be the sandbox on its own.

## 5. QuickJS compiled to WebAssembly (`quickjs-emscripten`)

- It can stop runaway code without killing a thread:
  - `runtime.setInterruptHandler(fn)` is called periodically while code runs;
  - `shouldInterruptAfterDeadline(Date.now() + ms)` stops evaluation at a deadline;
  - `setMemoryLimit` and `setMaxStackSize` cap memory and stack;
  - "By default, no host functionality is exposed to code running inside QuickJS" ([justjake/quickjs-emscripten README](https://github.com/justjake/quickjs-emscripten)).
- Costs:
  - about 0.5–1.3 MB of wasm and JS (the release-sync variant is ~640 KB; the core package plus that variant is ~1.3 MB);
  - it's an interpreter, so it's much slower than V8's JIT, though that hardly matters for tiny Puzzles;
  - its error messages and supported language features are QuickJS's, not the browser's;
  - promises need manual `executePendingJobs()` pumping;
  - it still runs on whatever thread calls it, so it belongs in a worker anyway.
- Choose it only if you need exact step or memory budgets or must avoid `eval` entirely. A Web Worker already covers the needs here.

## 6. Getting readable error messages

- **Syntax errors from `new Function` have no line numbers in V8.**
  - **[measured]** Chrome gives `SyntaxError: Unexpected token ';'`, and the stack points only at `new Function (<anonymous>)`.
  - `Error.prototype.lineNumber` is non-standard: Firefox has it, Chrome doesn't ([MDN Error.lineNumber](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/lineNumber)).
- **Option A, a parser.** Acorn throws a `SyntaxError` with `pos` (character offset) and `loc: {line, column}` ([acorn README](https://github.com/acornjs/acorn/tree/master/acorn)). Running `acorn.parse(source, {ecmaVersion: "latest"})` in the worker before compiling gives editor-friendly positions in every browser. The catch: acorn implements only finished (stage 4) syntax, so a newer syntax V8 accepts could be flagged as an error.
- **Option B, the worker's own script.**
  - If a worker's script fails to parse, an `error` event fires at the `Worker` object ([HTML, worker processing model](https://html.spec.whatwg.org/multipage/workers.html#worker-processing-model)).
  - **[measured]** For a Blob classic worker whose line 3 was `  return +;`, the `ErrorEvent` had `lineno: 3, colno: 11` and the message `Uncaught SyntaxError: Unexpected token ';'`.
  - So a Solution put straight into the worker's Blob source reports its position without a parser. Line numbers then need to be offset by the harness preamble.
- **Runtime errors.**
  - Add `//# sourceURL=solution.js` to the source. **[measured]** Stack frames then read `at sum (solution.js:4:14)`.
  - `new Function` adds a fixed two-line header: the spec builds `"function anonymous(" + params + LF + ") {" + LF + body + LF + "}"` ([ECMA-262 CreateDynamicFunction](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-createdynamicfunction)). So Solution line *n* shows up as *n+2*. The measured `:4` was Solution line 2.
  - Parsing `err.stack` is engine-specific, but `name: message` plus a best-effort line is enough for a typing game.

## Comparison

| | Web Worker | Sandboxed iframe | ShadowRealm | SES | QuickJS-wasm |
|---|---|---|---|---|---|
| Stop an infinite loop | Yes, `terminate()` works at any time | Not reliably (Chrome: replacement blocked behind the runaway loop) | No | No | Yes, interrupt handler and deadline |
| Page stays responsive while Solution spins | Yes | Chrome desktop yes; elsewhere not guaranteed | No | No | Only if run in a worker |
| Respawn cost | ~5–17 ms median [measured] | ~7–20 ms median, but blocked by runaway code | n/a | n/a | New context, cheap; wasm load once |
| Warm round trip | <0.1 ms [measured] | ~0.2–1.2 ms [measured] | sync | sync | sync, interpreted |
| DOM / localStorage | None | Blocked (opaque origin) | None by default | None by default | None |
| IndexedDB / Cache of the app | **Reachable** (same origin) | Blocked | n/a | Not unless granted | No |
| Network | Reachable unless page CSP `connect-src` blocks it (inherited by Blob workers) | Blocked by opaque origin plus `srcdoc` meta CSP | n/a | Not unless granted | No |
| Availability today | Baseline since 2015 | Universal | Not shipped (Stage 2.7) | Library | Library (~1 MB) |

## Recommendation (researcher's suggestion, not a decision)

**Use a dedicated module Web Worker created from a Blob URL. Start a fresh worker for each evaluation, keep one pre-spawned spare ready, and kill the worker with `terminate()` on timeout or when a newer run replaces it.**

Why:
- Only `terminate()` reliably stops `while(true){}` without the page's help, at a few ms per respawn [measured].
- The iframe looks better on isolation, but it fails the most important need: recovering from an infinite loop.
- A fresh worker per run means global changes never carry over between runs. The spare hides the cold-spawn p95.
- Lock down the network with a page CSP header that Blob workers inherit, for example `connect-src 'self'` or `'none'`. This only works if the host can set headers. A `<meta>` CSP applies to the document, and Blob workers inherit the document's policy, but I didn't test that path.
- Accidental access to the app's storage: before running the Solution, the harness can `delete`/shadow `self.indexedDB`, `self.caches`, `self.fetch` and `importScripts`. That isn't a security boundary, but the threat is accidents, not attacks.
- If real origin isolation is ever needed, the worker can be created from inside a sandboxed opaque-origin iframe. Not tested here.
- Suggested timeout: about 1000 ms of wall time per run. Show "Solution took too long (possible infinite loop)" and keep the Run going.
- For syntax errors, parse with acorn inside the worker (`ecmaVersion: "latest"`, `locations: true`). For runtime errors, use `//# sourceURL=solution.js` and subtract the 2-line `new Function` header.
- If the app's CSP must leave out `'unsafe-eval'`, build each worker's Blob as `harness + solution` instead of using `new Function`. That needs `worker-src blob:`.

### Sketch of the message protocol

```ts
// main → worker (one message per worker; the worker is single-use)
type RunRequest = {
  type: "run";
  runId: number;            // monotonically increasing; stale replies are dropped
  source: string;           // the Solution text
  entry: string;            // name the Puzzle expects, e.g. "sum"
  tests: Array<{ name: string; args: unknown[]; expected: unknown }>;  // structured-cloneable
  perTestTimeoutMs?: number; // optional soft budget (checked between tests)
};

// worker → main
type RunReply =
  | { type: "ready" }                                            // spare is warm
  | { type: "compile-error"; runId: number; message: string;
      line?: number; column?: number }                           // from acorn loc
  | { type: "results"; runId: number; durationMs: number;
      tests: Array<
        | { name: string; status: "pass" }
        | { name: string; status: "fail"; got: unknown /* cloned or String()'d */ }
        | { name: string; status: "error"; message: string; line?: number }
      > };
```

Main-thread runner, in outline:

```js
let spare = spawn();                       // new Worker(blobUrl, {type: "module"})
function evaluate(solution, puzzle) {
  current?.kill();                          // newer run replaces older one
  const w = spare; spare = spawn();         // keep one warm worker ready
  const runId = ++seq;
  const timer = setTimeout(() => { w.terminate(); emit({ runId, type: "timeout" }); }, 1000);
  w.onmessage = e => { if (e.data.runId !== runId) return;
                       clearTimeout(timer); w.terminate(); emit(e.data); };
  w.onerror  = e => { clearTimeout(timer); w.terminate();
                       emit({ runId, type: "compile-error", message: e.message, line: e.lineno }); };
  w.postMessage({ type: "run", runId, source: solution, entry: puzzle.entry, tests: puzzle.tests });
  current = { kill() { clearTimeout(timer); w.terminate(); } };
}
```

Inside the worker:
1. Parse with acorn and return `compile-error` on failure.
2. Compile with `new Function(source + "\n;return " + entry + ";\n//# sourceURL=solution.js")`.
3. Run each test inside its own `try/catch`. Compare results with a deep-equal, not `===`.
4. Make values that can't be cloned safe with `String()` before posting the results.

## Open questions

- Firefox and Safari numbers, and whether their sandboxed iframes run off the main thread. Not measured here.
- Whether the game should allow async Solutions (`await`). If so, the harness has to await each test, and the timeout covers the whole run.
- Whether the host for the static SPA can set a `Content-Security-Policy` header, or only a `<meta>`.
