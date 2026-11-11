// The same page in real Firefox, driven over WebDriver BiDi (Firefox 130+ speaks
// it natively; no Playwright build needed). Prints the measurements as JSON.
//   TOOLS=<folder with node_modules/esbuild and @bjorn3/browser_wasi_shim> \
//   node drive-firefox.mjs <built bundle folder> [/path/to/firefox]
import { createRequire } from "node:module";
import http from "node:http";
import { spawn } from "node:child_process";
import { cpSync, createReadStream, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const esbuild = createRequire(join(process.env.TOOLS, "x.js"))("esbuild");
const bundleDir = process.argv[2];
const firefox = process.argv[3] ?? "/Applications/Firefox.app/Contents/MacOS/firefox";

const www = mkdtempSync(join(tmpdir(), "purs-www-"));
for (const f of ["index.html", "page.mjs"]) cpSync(join(here, f), join(www, f));
cpSync(join(repo, "static/bundle"), join(www, "static/bundle"), { recursive: true, filter: (p) => !p.includes("/test") });
cpSync(bundleDir, join(www, "purs"), { recursive: true });
await esbuild.build({ entryPoints: [join(here, "worker.src.js")], bundle: true, format: "iife", outfile: join(www, "worker.js"), nodePaths: [join(process.env.TOOLS, "node_modules")], logLevel: "error" });
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".gz": "application/gzip" };
let requests = [];
const server = http.createServer((q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  requests.push(path);
  const file = join(www, path === "/" ? "index.html" : path);
  try { statSync(file); } catch { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const take = () => { const o = requests.filter((p) => p.startsWith("/purs/")).map((p) => p.slice(6)); requests = []; return o; };

const profile = mkdtempSync(join(tmpdir(), "ff-profile-"));
const proc = spawn(firefox, ["--headless", "--remote-debugging-port=0", "--profile", profile, "--no-remote"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  proc.stderr.on("data", (d) => { buf += d; const m = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(buf); if (m) resolve(m[1]); });
  proc.on("exit", () => reject(new Error("firefox exited: " + buf.slice(-300))));
});
const ws = new WebSocket(wsUrl + "/session");
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const [ok, bad] = pending.get(m.id); pending.delete(m.id); m.type === "error" ? bad(new Error(m.message)) : ok(m.result); } };
const send = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; pending.set(i, [ok, bad]); ws.send(JSON.stringify({ id: i, method, params })); });
await send("session.new", { capabilities: {} });
const { context } = await send("browsingContext.create", { type: "tab" });
const go = (url) => send("browsingContext.navigate", { context, url, wait: "complete" });
const evalJs = async (expression) => {
  const r = await send("script.evaluate", { expression: `(async () => JSON.stringify(await (${expression})))()`, target: { context }, awaitPromise: true, resultOwnership: "none" });
  if (r.type === "exception") throw new Error(JSON.stringify(r.exceptionDetails.text));
  return JSON.parse(r.result.value ?? "null");
};
const ready = async () => { for (let i = 0; i < 100 && !(await evalJs("window.loaded === true")); i++) await new Promise((r) => setTimeout(r, 100)); };

const R = { browser: "Firefox 158.0.1 (headless)" };
await go(base + "?remembered=javascript"); await ready();
await evalJs("window.harness.pick('javascript')");
await new Promise((r) => setTimeout(r, 1500));
R.javascriptOnly_bundleRequests = take();
let t = Date.now();
await evalJs("window.harness.pick('purescript')");
R.firstPick_ms = Date.now() - t;
R.firstPick_bundleRequests = take();
const code = "module Main where\nimport Prelude\nimport Data.Array (take)\n\nf :: Array Int -> Array Int\nf xs = take 2 xs\n";
R.compile = await evalJs(`window.harness.compile(${JSON.stringify(code)})`);
R.compile_requests = take().length;
R.compilePreludeOnly = await evalJs(`window.harness.compile(${JSON.stringify("module Main where\nimport Prelude\n\nf :: Int -> Int\nf x = x + 1\n")})`);
await go(base + "?remembered=purescript"); await ready();
await evalJs("window.harness.pick('purescript')");
R.rememberedReload_bundleRequests = take();
console.log(JSON.stringify(R, null, 1));
ws.close(); proc.kill(); server.close();
