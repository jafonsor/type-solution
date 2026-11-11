// Runs every Puzzle's PureScript Reference Solution through the BROWSER Checker
// (the exported app's real compiler worker and sandbox, in real Chrome) and
// through puzzle-check's Node runner, and compares the two, so they cannot
// drift (ticket 33 will make a smaller permanent test). Three variants per
// Puzzle: the Reference Solution (both must pass), the same with the first
// test's expectation changed (both must fail that test, and only that one), and
// the same with a type error added (both must report a compile error, and the
// type error's position and message must be the same).
//
//   TOOLS=<folder whose node_modules has playwright-core> PURS_WASM=... PURS_LIBS=... \
//     node drive-purescript-all.mjs <site folder exported with BASE=/type-solution/ and a purs bundle>
//
// Not part of `npm test` (needs Chrome, playwright-core, and about 5 minutes).
import { createRequire } from "node:module";
import http from "node:http";
import os from "node:os";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const { purescriptProblems, firstError } = await import(join(repo, "tools/puzzle-check/purs-runner.js"));
const { readPuzzle } = await import(join(repo, "tools/puzzle-check/puzzle-check.js"));
const site = process.argv[2];
if (!site) throw new Error("usage: drive-purescript-all.mjs <site folder>");
const BASE = "/type-solution/";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".gz": "application/gzip" };
const server = http.createServer((q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  let file = join(resolve(site), path.slice(BASE.length) || "index.html");
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); statSync(file); } catch { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
await page.goto(`http://localhost:${server.address().port}${BASE}`);
await page.waitForSelector(".cm-content");
await page.evaluate(() => {
  window.__run = (code, fn, tests) => new Promise((res) => {
    window.__session ??= window.TypeSolution.createChecker(new URL("static/js/runner.js", document.baseURI).href, "purescript");
    window.__session.start(JSON.stringify({ code, fn, tests }), (reply) => res(JSON.parse(reply)));
  });
});

const dir = join(repo, "puzzles");
const puzzles = readdirSync(dir).filter((n) => n.endsWith(".toml")).sort().map((n) => readPuzzle(n.slice(0, -5), readFileSync(join(dir, n), "utf8")).puzzle);
const refOf = (p) => p.solutions.purescript.reference;
const disagreements = [];
let n = 0;
const t0 = Date.now();
let browserMs = 0;
for (const p of puzzles) {
  const code = refOf(p);
  const run = async (c, tests) => {
    const t = Date.now();
    const r = await page.evaluate(([c2, f, ts]) => window.__run(c2, f, ts), [c, p.function, tests]);
    browserMs += Date.now() - t;
    return r;
  };
  // 1. the Reference Solution
  const a = await run(code, p.tests);
  const na = await purescriptProblems(p, code);
  n++;
  if (a.status !== "pass" || na.length) disagreements.push(`${p.identity} reference: browser ${a.status} ${a.message ?? ""} / node ${na.join("; ") || "pass"}`);
  // 2. the first test fails
  const wrong = p.tests.map((t, i) => (i === 0 ? { ...t, expected: "not it" } : t));
  const b = await run(code, wrong);
  const nb = await purescriptProblems({ ...p, tests: wrong }, code);
  n++;
  const bOk = b.status === "fail" && b.results.map((r) => r.pass).join() === wrong.map((_, i) => i !== 0).join();
  const nbOk = nb.length === 1 && /^test 1 failed/.test(nb[0]);
  if (!bOk || !nbOk) disagreements.push(`${p.identity} wrong test: browser ${b.status} ${JSON.stringify((b.results ?? []).map((r) => r.pass))} / node ${nb.join("; ")}`);
  // 3. a type error after the Solution
  const broken = code + "\nzzzBroken :: Int\nzzzBroken = \"s\"\n";
  const c = await run(broken, p.tests);
  const nc = await purescriptProblems(p, broken);
  n++;
  const browserLine = c.status === "error" && c.kind === "type" ? `${c.line}:${c.column} ${c.message}` : `${c.status} ${c.kind ?? ""}`;
  const nodeLine = /^compile error at (.*)$/.exec(nc[0] ?? "")?.[1];
  if (browserLine !== nodeLine) disagreements.push(`${p.identity} type error: browser "${browserLine}" / node "${nodeLine}"`);
}
await browser.close();
server.close();
console.log(JSON.stringify({
  puzzles: puzzles.length, runsCompared: n, disagreements,
  seconds: Math.round((Date.now() - t0) / 1000), browserMsPerCheck: Math.round(browserMs / n),
  loadAverageAtEnd: os.loadavg().map((x) => Number(x.toFixed(2))),
}, null, 1));
process.exit(disagreements.length ? 1 : 0);
