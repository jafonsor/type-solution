// The test-runner workers: one spare is always started ahead of time, so a
// check doesn't wait for a worker to start. Each check takes the spare and
// starts the next one; a worker that has run a Solution is never reused (its
// globals would leak into the next check), only terminated.
//
// `Worker` is the browser's Worker class, passed in so tests can fake it.
// The worker protocol is the runner script's and isn't touched here: a
// request string in, a reply string out.
export function createWorkerPool(Worker, url) {
  const spawn = () => new Worker(url, { type: "module" });
  let spare = spawn(); // started at creation, i.e. at page load
  let inFlight = null; // the worker running the current check

  function stop() {
    if (inFlight) {
      inFlight.onmessage = null;
      inFlight.terminate();
      inFlight = null;
    }
  }

  // Stop any check in flight, take the spare for this one and start the
  // next spare. `onReply` gets the reply text.
  function start(request, onReply) {
    stop();
    const worker = spare;
    spare = spawn();
    worker.onmessage = (e) => onReply(e.data);
    inFlight = worker;
    worker.postMessage(request);
  }

  return { start, stop };
}
