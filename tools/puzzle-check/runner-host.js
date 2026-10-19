// A Node worker that hosts the browser's test-runner script, unchanged.
//
// The runner is a module worker script: it sets `self.onmessage` and calls
// `postMessage` with JSON text. This file gives it those two names, loads its
// text as an ES module (as the browser's module worker does), then passes it
// each request the parent thread sends and passes its replies back.
import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

globalThis.self = globalThis;
globalThis.postMessage = (message) => parentPort.postMessage(message);

const source = readFileSync(workerData.runnerPath, "utf8");
await import("data:text/javascript;charset=utf-8," + encodeURIComponent(source));

parentPort.on("message", (data) => self.onmessage({ data }));
// Not JSON text, so the parent can tell it from the runner's replies.
parentPort.postMessage({ ready: true });
