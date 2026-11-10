// Drives the harness page in real Chrome and prints what happened, as JSON.
//   TOOLS=<folder with node_modules of playwright-core, esbuild and
//   @bjorn3/browser_wasi_shim> node drive.mjs <built bundle folder>
// Not part of `npm test` (needs Chrome and those packages; ticket 33 will own
// the app's browser smoke test). Shows, in a real browser:
//   1. JavaScript-only use: page load and picks make NO request under /purs/;
//   2. the first PureScript pick fetches current.json, the manifest and the
//      compiler, no library; a Solution importing Data.Array then fetches only
//      the packs of arrays and what it requires;
//   3. a reload with PureScript remembered fetches only the pointer (the rest
//      comes from Cache Storage);
//   4. a new bundle version (same compiler, a library renamed) leaves only the
//      new version's files in Cache Storage.
import { createRequire } from "node:module";
import http from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync, createReadStream, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const esbuild = need("esbuild");
const bundleDir = process.argv[2];
if (!bundleDir) throw new Error("usage: drive.mjs <built bundle folder>");

const www = mkdtempSync(join(tmpdir(), "purs-www-"));
for (const f of ["index.html", "page.mjs"]) cpSync(join(here, f), join(www, f));
cpSync(join(repo, "static/bundle"), join(www, "static/bundle"), { recursive: true, filter: (p) => !p.includes("/test") });
cpSync(bundleDir, join(www, "purs"), { recursive: true });
await esbuild.build({ entryPoints: [join(here, "worker.src.js")], bundle: true, format: "iife", outfile: join(www, "worker.js"), nodePaths: [join(process.env.TOOLS, "node_modules")], logLevel: "error" });

const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".gz": "application/gzip" };
let requests = [];
const server = http.createServer((q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  requests.push({ path, cache: q.headers["cache-control"] ?? null });
  const file = join(www, path === "/" ? "index.html" : path);
  try { statSync(file); } catch { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const bundleRequests = () => requests.filter((r) => r.path.startsWith("/purs/")).map((r) => r.path.slice(6));
const take = () => { const out = bundleRequests(); requests = []; return out; };

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
const R = { browser: browser.version() };

// 1. JavaScript only
await page.goto(base + "?remembered=javascript");
await page.waitForFunction("window.loaded");
await page.evaluate("window.harness.pick('javascript')");
await page.waitForTimeout(1500);
R.javascriptOnly_bundleRequests = take();
R.javascriptOnly_status = await page.evaluate("window.harness.status('purescript')");

// 2. First PureScript pick
let t = Date.now();
await page.evaluate("window.harness.pick('purescript')");
R.firstPick_ms = Date.now() - t;
R.firstPick_bundleRequests = take();
R.firstPick_cache = await page.evaluate("window.harness.cacheKeys()");
await page.evaluate("window.harness.pick('purescript')");
R.secondPick_bundleRequests = take();

// A Solution importing Data.Array: only its libraries are fetched.
const code = "module Main where\nimport Prelude\nimport Data.Array (take)\n\nf :: Array Int -> Array Int\nf xs = take 2 xs\n";
R.compile = await page.evaluate((c) => window.harness.compile(c), code);
R.compile_bundleRequests = take();
// For comparison: a Solution that imports only Prelude.
R.compilePreludeOnly = await page.evaluate((c) => window.harness.compile(c), "module Main where\nimport Prelude\n\nf :: Int -> Int\nf x = x + 1\n");
R.compilePreludeOnly_bundleRequests = take();

// 3. Reload, PureScript remembered
await page.goto(base + "?remembered=purescript");
await page.waitForFunction("window.loaded");
await page.evaluate("window.harness.pick('purescript')");
R.rememberedReload_bundleRequests = take();
R.rememberedReload_status = await page.evaluate("window.harness.status('purescript')");
R.rememberedReload_cacheKeys = (await page.evaluate("window.harness.cacheKeys()")).length;

// 4. A new version: same compiler, the arrays pack renamed, new manifest.
const current = JSON.parse(readFileSync(join(www, "purs/current.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(www, "purs", current.manifest), "utf8"));
const newPack = `arrays.${createHash("sha256").update("v2").digest("hex").slice(0, 16)}.pack.gz`;
renameSync(join(www, "purs", manifest.parts.arrays.file), join(www, "purs", newPack));
manifest.parts.arrays.file = newPack;
const text = JSON.stringify(manifest);
const newManifest = `manifest.${createHash("sha256").update(text).digest("hex").slice(0, 16)}.json`;
writeFileSync(join(www, "purs", newManifest), text);
writeFileSync(join(www, "purs/current.json"), JSON.stringify({ manifest: newManifest }));
const before = await page.evaluate("window.harness.cacheKeys()");
await page.goto(base + "?remembered=purescript");
await page.waitForFunction("window.loaded");
await page.evaluate("window.harness.pick('purescript')");
R.newVersion_bundleRequests = take();
const after = await page.evaluate("window.harness.cacheKeys()");
R.newVersion_cacheBefore = before.length;
R.newVersion_cacheAfter = after;
R.newVersion_oldFilesGone = !after.some((k) => k.includes(current.manifest) || k.includes(manifest.parts.arrays.file ?? "")) ;

console.log(JSON.stringify(R, null, 1));
await browser.close();
server.close();
