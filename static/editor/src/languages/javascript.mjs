// JavaScript, the first Language: a value with the four seams (see
// ../languages.mjs for the interface). Everything JavaScript-specific in the
// shim is here: the acorn parse, the test-runner worker, the CodeMirror mode.
import * as acorn from "acorn";
import { javascript as javascriptMode } from "@codemirror/lang-javascript";
import { createChecker as createWorkerPool } from "../checker.mjs";

const RUN_TIMEOUT_MS = 1000; // languages/javascript/language.json: timeouts.runMs

// The parser's verdict on the code: null, or a Checker error result. The
// message is acorn's own, "(line:column)" suffix included, as it always was.
function parseError(code) {
  try {
    acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
    return null;
  } catch (err) {
    const pos = err.pos ?? 0;
    return {
      status: "error", kind: "syntax", message: err.message,
      line: err.loc?.line ?? 1, column: err.loc?.column ?? 0,
      range: { from: pos, to: Math.max(err.raisedAt ?? pos, pos + 1) },
    };
  }
}

// The Checker: code that doesn't parse fails at once; the rest runs on a
// fresh worker (the spare, replaced by a new one), stopped after the run
// timeout. `env` is {Worker, url}: the browser's Worker class (a test can
// pass a fake) and the address of the runner script (static/src/js/runner.js;
// its request/reply protocol, strings in and out, is private to this file).
function createChecker({ Worker, url }) {
  const pool = createWorkerPool(Worker, url);
  let pending = null; // {resolve, timer} of the check in flight

  function settle(result) {
    if (!pending) return;
    const { resolve, timer } = pending;
    pending = null;
    clearTimeout(timer);
    pool.stop();
    resolve(result);
  }

  function stop() {
    settle({ status: "error", kind: "stopped", message: "stopped", line: 1, column: 0 });
  }

  function check(code, fn, tests) {
    stop(); // a newer check ends the older one
    const bad = parseError(code);
    if (bad) return Promise.resolve(bad);
    return new Promise((resolve) => {
      const timer = setTimeout(() => settle({
        status: "error", kind: "timeout", line: 1, column: 0,
        message: "Stopped after " + (RUN_TIMEOUT_MS / 1000).toFixed(1) + " s: an infinite loop?",
      }), RUN_TIMEOUT_MS);
      pending = { resolve, timer };
      pool.start(JSON.stringify({ code, fn, tests }), (reply) => settle(fromReply(reply)));
    });
  }

  return { check, stop };
}

// The runner's reply text as a Checker result.
function fromReply(reply) {
  let r;
  try { r = JSON.parse(reply); } catch { r = null; }
  if (r?.kind === "results") {
    const results = r.results;
    const pass = results.length > 0 && results.every((t) => t.pass);
    return { status: pass ? "pass" : "fail", message: "", line: 1, column: 0, results };
  }
  return {
    status: "error", kind: "crash", line: 1, column: 0,
    message: r?.kind === "error" ? r.message : "The test runner sent an unreadable reply.",
  };
}

export const javascript = {
  name: "javascript",
  title: "JavaScript",
  // Seam 4, the bank folder; language.json there holds the limits and the
  // timeouts this value mirrors.
  folder: "languages/javascript",
  // Per-Language settings.
  settings: { runTimeoutMs: RUN_TIMEOUT_MS, compileTimeoutMs: null },
  // Seam 1.
  createChecker,
  // Seam 2: a CodeMirror extension.
  editorMode: () => javascriptMode(),
  // Seam 3: none. JavaScript has no imports to add, so no popup.
  importRules: undefined,
};
