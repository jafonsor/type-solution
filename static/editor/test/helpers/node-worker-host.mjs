// A Node worker thread that hosts one of the browser's worker scripts unchanged
// (the PureScript compiler worker, its sandbox runner). The script is a module
// or classic worker script that sets `self.onmessage` and calls `postMessage`;
// this gives it those two names, loads it, then passes it each message the
// parent sends. For the sandbox, Blob URLs are stood in for by files in a
// temporary folder (Node cannot import blob: modules, and data: URLs that embed
// their dependencies grow exponentially along a diamond of imports).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

globalThis.self = globalThis;
globalThis.postMessage = (message) => parentPort.postMessage(message);
if (workerData.blobFiles) {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-blobs-"));
  let n = 0;
  globalThis.Blob = class { constructor(parts) { this.text = parts.join(""); } };
  URL.createObjectURL = (blob) => {
    const file = join(dir, `${n++}.mjs`);
    writeFileSync(file, blob.text);
    return pathToFileURL(file).href;
  };
}
await import(pathToFileURL(workerData.script).href);
parentPort.on("message", (data) => self.onmessage({ data }));
