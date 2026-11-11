// Times the PureScript Checker in a real browser, through the exported app's
// own shim (TypeSolution.createChecker): the real compiler worker, the real
// sandbox, the bundle from Cache Storage. Prints JSON, with the machine's load
// average next to every figure (so a busy machine is visible in the numbers).
//
//   TOOLS=<folder whose node_modules has playwright-core> \
//     node measure-purescript.mjs <site folder exported with BASE=/type-solution/ and a purs bundle> [chrome|firefox] [runs]
//
// For each Solution: the first check on a fresh page (compiler downloaded from
// the local server, libraries fetched), then `runs` unchanged and `runs` edited
// checks, each timed from `start` to the reply, with the compiler's own time
// and the number of source files it was given. Also a Prelude-only Solution
// and `import Data.Array`, and the typed-path Puzzle against a plain one.
//
// WARM=none|preload|during (default none) measures the warm-up (ticket 38):
//   none     nothing before the first check (the compiler downloads inside it)
//   preload  the page starts the download as a pick would and hands the checker
//            the Solution as the Reference Solution (checker.warmUp); the first
//            check is made WAIT_MS (default 3000) after the compiler is ready
//   during   the same, but the first check starts DURING_MS (default 20) after
//            the warm-up is handed over, once the compiler is ready: a real
//            check mid-warm-up
//   ready    the compiler is ready and the check made at once, with no warm-up
//            (the baseline for "during")
// The first check then costs what it costs in the app when the player starts
// typing after the page has settled.
import { createRequire } from "node:module";
import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { createReadStream, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { parse: parseToml } = createRequire(join(repo, "tools/puzzle-check/x.js"))("smol-toml");
const site = process.argv[2];
const which = process.argv[3] ?? "chrome";
const runs = Number(process.argv[4] ?? 8);
if (!site) throw new Error("usage: measure-purescript.mjs <site folder> [chrome|firefox] [runs]");
const BASE = "/type-solution/";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".gz": "application/gzip" };
const server = http.createServer((q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  if (!path.startsWith(BASE)) { r.writeHead(404); return r.end(); }
  let file = join(resolve(site), path.slice(BASE.length) || "index.html");
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); statSync(file); } catch { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const url = `http://localhost:${server.address().port}${BASE}`;

// --- a browser: evaluate(expression) -> JSON value --------------------------------------------
let evaluate, goto, close, browserName;
if (which === "chrome") {
  const { chromium } = need("playwright-core");
  const browser = await chromium.launch({ channel: "chrome" });
  browserName = "Chrome " + browser.version();
  const page = await (await browser.newContext()).newPage();
  goto = (u) => page.goto(u);
  evaluate = (expression) => page.evaluate(`(async () => (${expression}))()`);
  close = () => browser.close();
} else {
  const firefox = process.argv[5] ?? "/Applications/Firefox.app/Contents/MacOS/firefox";
  const profile = mkdtempSync(join(tmpdir(), "ff-profile-"));
  const proc = spawn(firefox, ["--headless", "--remote-debugging-port=0", "--profile", profile, "--no-remote"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((ok, bad) => {
    let buf = "";
    proc.stderr.on("data", (d) => { buf += d; const m = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(buf); if (m) ok(m[1]); });
    proc.on("exit", () => bad(new Error("firefox exited: " + buf.slice(-300))));
  });
  const ws = new WebSocket(wsUrl + "/session");
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const [ok, bad] = pending.get(m.id); pending.delete(m.id); m.type === "error" ? bad(new Error(m.message)) : ok(m.result); } };
  const send = (method, params = {}) => new Promise((ok, bad) => { const i = ++id; pending.set(i, [ok, bad]); ws.send(JSON.stringify({ id: i, method, params })); });
  const info = await send("session.new", { capabilities: {} });
  browserName = "Firefox " + (info.capabilities?.browserVersion ?? "");
  const { context } = await send("browsingContext.create", { type: "tab" });
  goto = (u) => send("browsingContext.navigate", { context, url: u, wait: "complete" });
  evaluate = async (expression) => {
    const r = await send("script.evaluate", { expression: `(async () => JSON.stringify(await (${expression})))()`, target: { context }, awaitPromise: true, resultOwnership: "none" });
    if (r.type === "exception") throw new Error(JSON.stringify(r.exceptionDetails.text));
    return JSON.parse(r.result.value ?? "null");
  };
  close = () => { ws.close(); proc.kill(); };
}

// --- in the page ---------------------------------------------------------------------------------
const mode = process.env.WARM ?? "none";
const waitMs = Number(process.env.WAIT_MS ?? 3000);
const setup = `(() => {
  window.__ready = () => new Promise((res) => {
    window.TypeSolution.watchLoading((name, state) => { if (name === "purescript" && state === "ready") res(true); });
    window.TypeSolution.retryLoading("purescript");
  });
  window.__warm = (code, fn, tests) => {
    window.__session ??= window.TypeSolution.createChecker(new URL("static/js/runner.js", document.baseURI).href, "purescript");
    window.__session.warmUp(JSON.stringify({ code, fn, tests }));
  };
  window.__time = (code, fn, tests) => new Promise((res) => {
    window.__session ??= window.TypeSolution.createChecker(new URL("static/js/runner.js", document.baseURI).href, "purescript");
    const t0 = performance.now();
    window.__session.start(JSON.stringify({ code, fn, tests }), (reply) => {
      const r = JSON.parse(reply);
      res({ ms: Math.round(performance.now() - t0), status: r.status === "error" ? "error: " + r.kind + " " + r.message : r.status, compileMs: r.timing?.compileMs ?? null, files: r.timing?.sourceFiles ?? null });
    });
  });
  return true;
})()`;

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const load = () => os.loadavg().map((n) => Number(n.toFixed(2)));

const solutions = {
  "Prelude only": { fn: "f", code: "import Prelude\n\nf :: Int -> Int\nf x = x + 1\n", tests: [{ args: [1], expected: 2 }] },
  "import Data.Array": { fn: "f", code: "import Prelude\nimport Data.Array (take)\n\nf :: Array Int -> Array Int\nf xs = take 2 xs\n", tests: [{ args: [[1, 2, 3]], expected: [1, 2] }] },
};
const bank = (id) => { const doc = parseToml(readFileSync(join(repo, "puzzles", id + ".toml"), "utf8")); return { fn: doc.function, code: doc.purescript.reference, tests: doc.tests }; };
// The same body and imports, with an Eq constraint (the sandbox supplies the dictionary) and with a Show
// constraint (the typed path: a Harness module compiled with the Solution), to price the typed path alone.
const sameBody = (cls) => ({ fn: "f", code: `import Prelude\nimport Data.Array (take)\n\nf :: forall a. ${cls} a => Array a -> Array a\nf xs = take 2 xs\n`, tests: [{ args: [[1, 2, 3]], expected: [1, 2] }, { args: [["a", "b", "c"]], expected: ["a", "b"] }] });
solutions["Eq constraint, Data.Array (dictionary by hand)"] = sameBody("Eq");
solutions["Show constraint, Data.Array (typed path)"] = sameBody("Show");
solutions["chunk (Puzzle, Data.Array)"] = bank("chunk");
solutions["queryString (Puzzle, typed path)"] = bank("queryString");
solutions["withDefaults (Puzzle, Union and Nub)"] = bank("withDefaults");

const R = { browser: null, runsPerSeries: runs, machine: { cpus: os.cpus().length, model: os.cpus()[0].model }, series: {} };
const wanted = process.env.SERIES?.split("|");
for (const [name, s] of Object.entries(solutions)) {
  if (wanted && !wanted.includes(name)) continue;
  // A fresh page each: the first check pays for everything (cached compiler after the first series).
  await goto(url);
  await evaluate(setup);
  const out = { loadBefore: load() };
  const args = `${JSON.stringify(s.code)}, ${JSON.stringify(s.fn)}, ${JSON.stringify(s.tests)}`;
  if (mode !== "none") await evaluate(`window.__ready()`);
  if (mode === "othercompile") {
    // An experiment, not shipped: a throwaway compile in a second Checker's own worker first.
    await evaluate(`new Promise((res) => { const c = window.TypeSolution.createChecker(new URL("static/js/runner.js", document.baseURI).href, "purescript"); c.start(JSON.stringify({ code: ${JSON.stringify(s.code)}, fn: ${JSON.stringify(s.fn)}, tests: ${JSON.stringify(s.tests)} }), () => res(true)); })`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (mode === "preload") { await evaluate(`window.__warm(${args})`); await new Promise((r) => setTimeout(r, waitMs)); }
  out.first = mode === "during"
    ? await evaluate(`(window.__warm(${args}), new Promise((r) => setTimeout(r, ${Number(process.env.DURING_MS ?? 20)})).then(() => window.__time(${args})))`)
    : await evaluate(`window.__time(${args})`);
  out.unchanged = [];
  out.edited = [];
  for (let i = 0; i < runs; i++) out.unchanged.push(await evaluate(`window.__time(${JSON.stringify(s.code)}, ${JSON.stringify(s.fn)}, ${JSON.stringify(s.tests)})`));
  for (let i = 0; i < runs; i++) out.edited.push(await evaluate(`window.__time(${JSON.stringify(s.code + "\n-- edit " + i + "\n")}, ${JSON.stringify(s.fn)}, ${JSON.stringify(s.tests)})`));
  out.loadAfter = load();
  out.statuses = [...new Set([out.first, ...out.unchanged, ...out.edited].map((x) => x.status))];
  out.summary = {
    first_ms: out.first.ms,
    unchanged_median_ms: median(out.unchanged.map((x) => x.ms)), unchanged_all_ms: out.unchanged.map((x) => x.ms),
    edited_median_ms: median(out.edited.map((x) => x.ms)), edited_all_ms: out.edited.map((x) => x.ms),
    compile_median_ms: median(out.edited.map((x) => x.compileMs)), source_files_given: out.edited[0].files,
  };
  R.series[name] = { load_before_after: [out.loadBefore, out.loadAfter], statuses: out.statuses, ...out.summary };
}
R.browser = browserName;
console.log(JSON.stringify(R, null, 1));
await close();
server.close();
