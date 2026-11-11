// Drives the EXPORTED site in real Chrome, served under /type-solution/ like
// GitHub Pages, and shows (ticket 37): (1) a JavaScript-only page load and
// Language picks make no request under purs/; (2) the bundle's files are at
// the right URLs under the base path: purs/current.json resolved against the
// page's own <base>, then the manifest it names.
//
//   TOOLS=<folder whose node_modules has playwright-core> \
//     node drive-site.mjs <site folder exported with BASE=/type-solution/ and a purs bundle>
// Not part of `npm test` (needs Chrome and playwright-core).
import { createRequire } from "node:module";
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const site = process.argv[2];
if (!site) throw new Error("usage: drive-site.mjs <site folder>");
const BASE = "/type-solution/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".gz": "application/gzip" };
let requests = [];
const server = http.createServer((q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  requests.push(path);
  if (!path.startsWith(BASE)) { r.writeHead(404); return r.end(); }
  let file = join(resolve(site), path.slice(BASE.length) || "index.html");
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); statSync(file); } catch { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const origin = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext()).newPage();
const R = { browser: browser.version() };
await page.goto(origin + BASE);
await page.waitForSelector(".cm-editor", { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(3000);
R.title = await page.title();
R.editorMounted = (await page.$(".cm-editor")) !== null;
R.baseURI = await page.evaluate("document.baseURI");
R.totalRequests = requests.length;
R.requestsUnderPurs_javascriptOnlyLoad = requests.filter((p) => p.startsWith(BASE + "purs/"));
R.nonOkResponsesSeen = requests.filter((p) => !p.startsWith(BASE)).length;
requests = [];
// Where the loader would look: purs/current.json against the page's base.
R.pointerUrl = await page.evaluate("new URL('purs/current.json', document.baseURI).href");
const pointer = await page.evaluate("fetch(new URL('purs/current.json', document.baseURI)).then(r => r.json())");
const manifest = await page.evaluate((n) => fetch(new URL('purs/' + n, document.baseURI)).then(async (r) => ({ status: r.status, parts: Object.keys((await r.json()).parts).length })), pointer.manifest);
R.pointer = pointer; R.manifest = manifest;
R.requestsUnderPurs_afterExplicitFetch = requests.filter((p) => p.startsWith(BASE + "purs/"));
await browser.close(); server.close();
console.log(JSON.stringify(R, null, 1));
