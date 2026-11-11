// JavaScript, the first Language: a value with the four seams (see
// ../languages.mjs for the interface). Everything JavaScript-specific in the
// shim is here: the acorn parse, the test-runner worker, the CodeMirror mode.
import * as acorn from "acorn";
import { javascript as javascriptMode } from "@codemirror/lang-javascript";
import { createSandbox, timeoutMessage } from "../sandbox.mjs";

const RUN_TIMEOUT_MS = 1000; // languages/javascript/language.json: timeouts.runMs

// The parser's verdict on the code: null, or a Checker error result. The
// message is acorn's without its "(line:column)" suffix (the status line says
// where, from `line` and `column`, which count from 1); `all` is acorn's own text.
function parseError(code) {
  try {
    acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
    return null;
  } catch (err) {
    const pos = err.pos ?? 0;
    const range = { from: pos, to: Math.max(err.raisedAt ?? pos, pos + 1) };
    return {
      status: "error", kind: "syntax", message: err.message.replace(/\s*\(\d+:\d+\)$/, ""), all: err.message,
      line: err.loc?.line ?? 1, column: (err.loc?.column ?? 0) + 1,
      range, ranges: [range],
    };
  }
}

// The Checker: code that doesn't parse fails at once; the rest runs in the
// shared sandbox (../sandbox.mjs: a fresh worker, the spare replaced by a new
// one, stopped after the run timeout). `env` is {Worker, url}: the browser's
// Worker class (a test can pass a fake) and the address of the runner script
// (static/src/js/runner.js; its request/reply protocol, strings in and out, is
// private to this file).
function createChecker({ Worker, url }) {
  const sandbox = createSandbox({ Worker, url, timeoutMs: RUN_TIMEOUT_MS });

  function stop() {
    sandbox.stop();
  }

  async function check(code, fn, tests) {
    stop(); // a newer check ends the older one
    const bad = parseError(code);
    if (bad) return bad;
    const outcome = await sandbox.run(JSON.stringify({ code, fn, tests }));
    if (outcome.kind === "stopped") return { status: "error", kind: "stopped", message: "stopped", line: 1, column: 1 };
    if (outcome.kind === "timeout") {
      return { status: "error", kind: "timeout", line: 1, column: 1, message: timeoutMessage(RUN_TIMEOUT_MS) };
    }
    return fromReply(outcome.text);
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
    return { status: pass ? "pass" : "fail", message: "", line: 1, column: 1, results };
  }
  return {
    status: "error", kind: "crash", line: 1, column: 1,
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
