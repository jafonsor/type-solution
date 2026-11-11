// A `Worker` class for the Checker in Node: `new Worker(url, {type: "module"})`
// runs the script that `scripts` maps the url's file name to, in a worker
// thread (node-worker-host.mjs), with the browser's Worker interface
// (postMessage, onmessage, terminate).
import { Worker as ThreadWorker } from "node:worker_threads";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const host = fileURLToPath(new URL("./node-worker-host.mjs", import.meta.url));

// scripts: {"purs-compiler.js": "/path/to/the/script", ...}
export function nodeWorkerClass(scripts) {
  return class NodeWorker {
    constructor(url) {
      const script = scripts[basename(new URL(url, "http://x/").pathname)];
      if (!script) throw new Error(`no script for ${url}`);
      this.onmessage = null;
      this.thread = new ThreadWorker(host, { workerData: { script, blobFiles: /sandbox/.test(script) } });
      this.thread.on("message", (data) => this.onmessage?.({ data }));
      this.thread.on("error", (err) => console.error("worker error:", err));
    }
    postMessage(message) { this.thread.postMessage(message); }
    terminate() { this.thread.terminate(); }
  };
}
