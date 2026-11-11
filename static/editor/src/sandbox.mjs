// The sandbox every Language runs a Solution's tests in: a fresh worker per
// run, from a pool that keeps one spare started ahead of time (worker-pool.mjs),
// stopped after the Language's run timeout so an infinite loop can't hang the
// page. The worker script is the Language's own (its request and reply are
// text, private to it); the mechanism, its timeout and its stopping are this
// file's, for every Language: every Language's runner runs here.
import { createWorkerPool } from "./worker-pool.mjs";

// What the player reads when the sandbox is stopped for running too long.
export const timeoutMessage = (ms) => "Stopped after " + (ms / 1000).toFixed(1) + " s: an infinite loop?";

// `Worker` is the browser's class (a test passes a fake); `url` the runner script;
// `timeoutMs` a number, or a function giving it when a run starts.
// run(request) resolves one of
//   {kind: "reply", text}   the worker's reply text
//   {kind: "timeout"}       it ran longer than timeoutMs and was terminated
//   {kind: "stopped"}       a newer run or stop() ended it (nobody wants its result)
export function createSandbox({ Worker, url, timeoutMs }) {
  const pool = createWorkerPool(Worker, url);
  let pending = null; // {resolve, timer} of the run in flight

  function settle(result) {
    if (!pending) return;
    const { resolve, timer } = pending;
    pending = null;
    clearTimeout(timer);
    pool.stop();
    resolve(result);
  }

  function stop() {
    settle({ kind: "stopped" });
  }

  function run(request) {
    stop(); // a newer run ends the older one
    return new Promise((resolve) => {
      const timer = setTimeout(() => settle({ kind: "timeout" }), typeof timeoutMs === "function" ? timeoutMs() : timeoutMs);
      pending = { resolve, timer };
      pool.start(request, (text) => settle({ kind: "reply", text }));
    });
  }

  return { run, stop };
}
