// The permanent browser smoke test for the PureScript check (ticket 33). It
// drives the EXPORTED app, with its bundle, in real Chrome, so the shipped
// Checker (ticket 31) is the one under test, and compares it with puzzle-check's
// Node runner so the two cannot drift apart:
//
//   1. a type error reads the same in the page and in puzzle-check: the same
//      line, column and cleaned first-error message (the body up to the
//      "See https://" link, one line, 300 characters). The status line wraps
//      that as "doesn't type-check yet: line L, column C: <message>"; the
//      wrapper is taken off, the three fields are compared. The Solution has a
//      warning before its error, so the "first" error must be agreed on too;
//   2. a syntax error gives a "doesn't parse yet" line whose message equals
//      puzzle-check's. Its position is NOT compared: the page moves it to the
//      end of the line before the break on purpose (to underline the `+`), and
//      puzzle-check reports the compiler's own;
//   3. the fixed Puzzle's Reference Solution passes in the page.
//
// Everything else (loading line, underlines, menu, popup...) is
// drive-purescript.mjs, which is not run in CI. Running every Reference
// Solution in the page is out of scope (browser-checker.test.mjs does it in
// Node).
//
//   PURS_WASM=<purs-core.wasm> PURS_LIBS=<library sources> TOOLS=<folder whose node_modules has playwright-core> \
//     node smoke-purescript.mjs <site folder exported with BASE=/type-solution/ and a purs bundle>
//
// The site comes from `nix build -o app`, `nix build .#purs-bundle -o pb`, then
// `tools/export-site.sh app site /type-solution/ pb`; PURS_WASM is
// `nix build .#purs-core-wasm`, PURS_LIBS `nix build .#purs-bundle.libs`.
// Needs `npm ci --prefix tools/puzzle-check` (smol-toml). The workflow is
// .github/workflows/purescript-smoke.yml.
import { createRequire } from "node:module";
import http from "node:http";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const { parse: parseToml } = createRequire(join(repo, "tools/puzzle-check/x.js"))("smol-toml");
const { purescriptProblems } = await import(pathToFileURL(join(repo, "tools/puzzle-check/purs-runner.js")).href);
const site = process.argv[2];
if (!site) throw new Error("usage: smoke-purescript.mjs <site folder>");
if (!process.env.PURS_WASM || !process.env.PURS_LIBS) throw new Error("set PURS_WASM and PURS_LIBS (the Node side of the comparison needs the compiler)");
const BASE = "/type-solution/";

// The fixed Puzzle. The page picks its Puzzle with Math.random; a fixed number
// picks this one (the bank is the files in puzzles/ in sorted order). If the
// bank changes so that the pick is another Puzzle the test says so.
const FIXED = "clamp";
const ids = readdirSync(join(repo, "puzzles")).filter((n) => n.endsWith(".toml")).map((n) => n.slice(0, -5)).sort();
const index = ids.indexOf(FIXED);
if (index < 0) throw new Error(`puzzles/${FIXED}.toml is gone: pick another fixed Puzzle`);
const pick = (index + 0.5) / ids.length;
const doc = parseToml(readFileSync(join(repo, "puzzles", `${FIXED}.toml`), "utf8"));
const puzzle = { function: doc.function, tests: doc.tests ?? [], signature: doc.purescript.signature, reference: doc.purescript.reference };

// The Solutions with a known error: the same text goes to both runners.
const fixture = (name) => readFileSync(join(repo, "tools/puzzle-check/test/purs-fixtures", name + ".purs"), "utf8");
const typeCode = fixture("warning-then-error");
const syntaxCode = fixture("syntax-error");

// --- a static server like Pages ---------------------------------------------------------------
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

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(ok ? "PASS" : "FAIL", name, ok ? "" : (detail ?? "")); };

// The page's three fields of an error, from the status line it wraps them in.
const fromStatus = (status, verdict) => {
  const m = new RegExp(`^${verdict} yet: line (\\d+), column (\\d+): (.*)$`, "s").exec(status);
  return m && { line: Number(m[1]), column: Number(m[2]), message: m[3] };
};
// puzzle-check's: "compile error at L:C <message>".
const fromNode = (problems) => {
  const m = /^compile error at (\d+):(\d+) (.*)$/s.exec(problems[0] ?? "");
  return problems.length === 1 && m ? { line: Number(m[1]), column: Number(m[2]), message: m[3] } : null;
};

const browser = await chromium.launch({ channel: "chrome" });
console.log("Chrome", browser.version());
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR", (e.stack ?? e.message).split("\n").slice(0, 6).join(" | ")));
  await page.addInitScript((x) => { Math.random = () => x; }, pick);
  await page.goto(url);
  await page.waitForSelector(".cm-content", { timeout: 120000 });
  await page.waitForSelector(".editor-bar select");
  await page.locator(".editor-bar select").selectOption({ label: "PureScript" });
  const status = () => page.locator(".status .phase").innerText();
  const waitStatus = async (re, timeout = 120000) => {
    await page.waitForFunction((s) => new RegExp(s).test(document.querySelector(".status .phase")?.textContent ?? ""), re.source, { timeout });
    return page.locator(".status .phase").textContent();
  };
  const put = async (code) => {
    await page.locator(".cm-content").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+KeyA" : "Control+KeyA");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(code);
  };
  await waitStatus(/^Start typing/);

  await page.waitForFunction(() => document.querySelector("h1.signature")?.textContent.includes("::"), null, { timeout: 10000 });
  const signature = (await page.locator("h1.signature").innerText()).trim();
  check(`the page's fixed Puzzle is ${FIXED}`, signature === puzzle.signature.trim(), `the page shows ${JSON.stringify(signature)}`);

  // A type error, compared with puzzle-check.
  const typeNode = fromNode(await purescriptProblems(puzzle, typeCode));
  check("puzzle-check reports the type error with a position and a message", typeNode && typeNode.message.length > 0, JSON.stringify(typeNode));
  await put(typeCode);
  const typeStatus = await waitStatus(/^doesn't type-check yet: /);
  const typeBrowser = fromStatus(typeStatus, "doesn't type-check");
  check("the browser's type error has a position and a non-empty message", typeBrowser && typeBrowser.message.length > 0, typeStatus);
  check("the type error is the same in the browser and in puzzle-check (line, column, message)",
    JSON.stringify(typeBrowser) === JSON.stringify(typeNode), `\n  browser:      ${JSON.stringify(typeBrowser)}\n  puzzle-check: ${JSON.stringify(typeNode)}`);

  // A syntax error: a message equal to puzzle-check's (not its position, see above).
  const syntaxNode = fromNode(await purescriptProblems(puzzle, syntaxCode));
  await put(syntaxCode);
  const syntaxStatus = await waitStatus(/^doesn't parse yet: /);
  const syntaxBrowser = fromStatus(syntaxStatus, "doesn't parse");
  check("the browser's syntax error has a position and a non-empty message", syntaxBrowser && syntaxBrowser.message.length > 0, syntaxStatus);
  check("the syntax error's message is the same in the browser and in puzzle-check",
    syntaxBrowser && syntaxNode && syntaxBrowser.message === syntaxNode.message, `\n  browser:      ${syntaxBrowser?.message}\n  puzzle-check: ${syntaxNode?.message}`);

  // The Reference Solution last: a pass ends the Run, which then takes no more edits.
  await put(puzzle.reference);
  const passed = await waitStatus(/^Passed in /, 30000).catch(async () => `no pass; the status line reads: ${await status()}`);
  check("the Reference Solution passes in the browser", /^Passed in /.test(passed), passed);
} finally {
  await browser.close();
  server.close();
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
