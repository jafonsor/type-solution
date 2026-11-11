// Drives the built app in a real browser and checks the Editor mode and the
// import popup (ticket 32): the popup, Tab and Enter accepting, merging, Esc
// and click-away, Tab indenting with no popup, a Language without import
// rules showing none, switching Language swapping only the mode, and the
// app's own key-press recorder leaving the import line out of the Run record.
//
//   TOOLS=<folder whose node_modules has playwright-core and esbuild> \
//     node drive-imports.mjs <exported site folder> <built purs-bundle folder> \
//                            [chrome|firefox] [screenshot-prefix]
//
// The site comes from `nix build` then `tools/export-site.sh result site /`;
// the bundle folder from `nix build .#purs-bundle` (its names.<hash>.json is
// what the popup reads, through static/bundle/bundle.mjs). The app has no
// PureScript yet (ticket 31 adds its Checker and registers it), so the
// page is served with the shim REBUILT from the same sources plus a test
// registration of a Language "purescript": its real mode and import rules,
// the name table loaded from the bundle, and a stub Checker that passes any
// code containing PASS. The rebuild is needed because a second copy of
// CodeMirror would not do. Chrome is driven with Playwright; Firefox over
// WebDriver BiDi (as tools/purs-bundle/browser/drive-firefox.mjs does).
// Not part of `npm test`; ticket 33 owns the smoke test.
import { createRequire } from "node:module";
import http from "node:http";
import { createReadStream, mkdtempSync, writeFileSync, readFileSync, statSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const esbuild = need("esbuild");
const [site, bundleDir, which = "chrome", shotPrefix] = process.argv.slice(2);
if (!site || !bundleDir) throw new Error("usage: drive-imports.mjs <site folder> <purs-bundle folder> [chrome|firefox] [screenshot-prefix]");

// --- the page: the app's site, the shim rebuilt with a test Language ---------------------------
const work = mkdtempSync(join(tmpdir(), "drive-imports-"));
const entry = join(repo, "static/editor/src/zz-drive-entry.js"); // inside the repo so imports resolve; removed below
writeFileSync(entry, `
import "./editor.js";
import { purescriptEditorSeams, namesFromBundle } from "./languages/purescript.mjs";
import { createBundle } from "../../bundle/bundle.mjs";
const bundle = createBundle({ fetch: (...a) => fetch(...a), caches, entry: "/bundle/current.json", cacheName: "drive-imports" });
window.TypeSolution.registerLanguage({
  name: "purescript", title: "PureScript (test)", folder: "languages/purescript", settings: {},
  createChecker: () => ({
    check: async (code, fn, tests) => code.includes("PASS")
      ? { status: "pass", results: tests.map(() => ({ pass: true, got: "x" })) }
      : { status: "fail", results: tests.map(() => ({ pass: false, got: "stub" })) },
    stop() {},
  }),
  ...purescriptEditorSeams({ loadNames: namesFromBundle(bundle) }),
  bundle: { start: async () => {} },
});
`);
try {
  await esbuild.build({ entryPoints: [entry], bundle: true, format: "iife", minify: true, outfile: join(work, "editor.js"), logLevel: "error" });
} finally {
  try { (await import("node:fs")).rmSync(entry); } catch { /* already gone */ }
}
cpSync(bundleDir, join(work, "bundle"), { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = http.createServer((q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  let file = /editor\.js$/.test(path) ? join(work, "editor.js") : path.startsWith("/bundle/") ? join(work, path) : join(site, path === "/" ? "index.html" : path);
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); statSync(file); } catch { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

// --- two backends with one small interface -------------------------------------------------------
const KEYS = { Tab: "\uE004", Enter: "\uE007", Escape: "\uE00C", Backspace: "\uE003", Meta: "\uE03D", Alt: "\uE00A", Control: "\uE009", Home: "\uE011", End: "\uE010" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let B;
if (which === "chrome") {
  const { chromium } = need("playwright-core");
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("CONSOLE", m.text(), m.location().url); });
  page.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url()); });
  B = {
    name: "Chrome " + browser.version(),
    goto: (u) => page.goto(u),
    ev: (expr) => page.evaluate(`(async () => (${expr}))()`),
    // press("Tab"), press("z", ["Meta"]); a char or a name from KEYS
    press: async (k, mods = []) => { await page.keyboard.press([...mods, k === " " ? "Space" : k].join("+")); },
    typeChar: (c) => page.keyboard.type(c),
    click: (x, y) => page.mouse.click(x, y),
    shot: (p) => page.screenshot({ path: p }),
    dark: () => page.emulateMedia({ colorScheme: "dark" }),
    close: () => browser.close(),
  };
} else {
  const firefox = "/Applications/Firefox.app/Contents/MacOS/firefox";
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
  const caps = await send("session.new", { capabilities: {} });
  const { context } = await send("browsingContext.create", { type: "tab" });
  await send("browsingContext.setViewport", { context, viewport: { width: 1000, height: 800 } });
  const keyActions = async (actions) => send("input.performActions", { context, actions: [{ type: "key", id: "kb", actions }] });
  B = {
    name: "Firefox " + (caps.capabilities?.browserVersion ?? ""),
    goto: (u) => send("browsingContext.navigate", { context, url: u, wait: "complete" }),
    ev: async (expr) => {
      const r = await send("script.evaluate", { expression: `(async () => JSON.stringify(await (${expr})))()`, target: { context }, awaitPromise: true, resultOwnership: "none" });
      if (r.type === "exception") throw new Error(JSON.stringify(r.exceptionDetails.text));
      return JSON.parse(r.result.value ?? "null");
    },
    press: async (k, mods = []) => {
      const v = (x) => KEYS[x] ?? x;
      await keyActions([...mods.map((m) => ({ type: "keyDown", value: v(m) })), { type: "keyDown", value: v(k) }, { type: "keyUp", value: v(k) }, ...mods.reverse().map((m) => ({ type: "keyUp", value: v(m) }))]);
    },
    typeChar: (c) => keyActions([{ type: "keyDown", value: c }, { type: "keyUp", value: c }]),
    click: (x, y) => send("input.performActions", { context, actions: [{ type: "pointer", id: "m", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 }, { type: "pointerUp", button: 0 }] }] }),
    shot: async (p) => { const r = await send("browsingContext.captureScreenshot", { context }); writeFileSync(p, Buffer.from(r.data, "base64")); },
    dark: async () => {},
    close: async () => { ws.close(); proc.kill(); },
  };
}

// --- helpers --------------------------------------------------------------------------------------
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const shot = (name) => shotPrefix && B.shot(`${shotPrefix}-${which}-${name}.png`);
// What the Run should have counted: every press except the ones that accept the popup.
let counted = [];
const SPECIAL = { Tab: "\t", Enter: "\n", Backspace: "\b" };
const typed = async (text) => { for (const c of text) { if (c === "\n") { await B.press("Enter"); } else { await B.typeChar(c); } counted.push(c); await sleep(25); } await sleep(120); };
const pressed = async (k, mods = [], countIt = true) => { await B.press(k, mods); if (countIt) counted.push(SPECIAL[k] ?? k); await sleep(120); };
const accept = (k) => pressed(k, [], false); // Tab or Enter that accepts the popup: not typing
const doc = () => B.ev(`[...document.querySelectorAll('.cm-line')].map(l => l.textContent.replace(/\\u200b/g, '')).join('\\n')`);
// each offer as "name|module"
const items = () => B.ev(`[...document.querySelectorAll('.cm-tooltip-autocomplete li')].map(li => li.querySelector('.cm-completionLabel').textContent + '|' + li.querySelector('.cm-completionDetail').textContent)`);
const menuOpen = () => B.ev(`document.querySelector('.editor-bar select').disabled`);
const lang = () => B.ev(`document.querySelector('.editor-bar select').selectedOptions[0].textContent`);
const pickLanguage = (label) => B.ev(`(() => { const s = document.querySelector('.editor-bar select'); s.selectedIndex = [...s.options].findIndex(o => o.textContent === ${JSON.stringify(label)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const rect = (sel) => B.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const focusEditor = async () => { const r = await rect(".cm-line:last-child"); await B.click(r.x + r.w - 20, r.y + r.h / 2); await sleep(100); };
const MOD = process.platform === "darwin" ? "Meta" : "Control";
async function open() {
  await B.goto(base);
  for (let i = 0; i < 300; i++) { if (await B.ev(`!!document.querySelector('.cm-content') && !!document.querySelector('.editor-bar select')`)) break; await sleep(100); }
  await B.ev(`localStorage.removeItem('type-solution.runs')`);
  counted = [];
}

console.log("browser:", B.name);
await open();
await pickLanguage("PureScript (test)");
await sleep(300);
check("PureScript is picked, and its editor starts empty", (await lang()) === "PureScript (test)" && (await doc()) === "");
await focusEditor();

// --- the popup ------------------------------------------------------------------------------------
await typed("f = tak");
await sleep(300); // the name table loads on the first need
let list = await items();
check("typing a known name after 2 letters opens the popup, each name with its module", list.length > 0 && list.some((t) => t === "take|Data.Array") && list.some((t) => t.startsWith("takeEnd|")), JSON.stringify(list));
check("the popup shows at most 6 offers", list.length <= 6, list.length);
await shot("popup");
await accept("Tab");
check("Tab adds only the import line: the typed letters are untouched", (await doc()) === "import Data.Array (take)\n\nf = tak", JSON.stringify(await doc()));
check("the popup closes after accepting", (await items()).length === 0);
await typed("e");
check("the cursor kept its place: the player still types the whole name", (await doc()).endsWith("f = take"), JSON.stringify(await doc()));

await typed(" xs\ng = dr");
list = await items();
check("a second name opens the popup", list.some((t) => t === "drop|Data.Array"), JSON.stringify(list));
await accept("Enter");
check("Enter accepts instead of making a newline, and MERGES into the existing import", (await doc()).startsWith("import Data.Array (take, drop)\n\nf = take xs\ng = dr"), JSON.stringify(await doc()));
await typed("op xs");

await typed("\nh = tak");
list = await items();
check("a name already imported (take) is not offered, other names with the letters are", list.length > 0 && !list.some((t) => t.startsWith("take|")) && list.some((t) => t.startsWith("takeEnd|")), JSON.stringify(list));
await typed("e");
await B.press("Escape"); await sleep(150);
check("Esc closes the popup", (await items()).length === 0);
check("and only the popup: the Run is not paused, the menu stays closed", (await menuOpen()) === false);

// Tab with no popup indents
await pressed("Tab");
check("Tab with no popup indents (two spaces)", (await doc()).split("\n").at(-1) === "  h = take", JSON.stringify((await doc()).split("\n").at(-1)));

// Prelude names: never offered, whatever module re-exports them
await typed("\nm = sh");
check("a Prelude name (show) is never offered", !(await items()).some((t) => t.startsWith("show|")), JSON.stringify(await items()));
await typed("ow x\nn = ma");
check("a Prelude name (map) is never offered either, though other names start with ma", (await items()).length > 0 && !(await items()).some((t) => t.startsWith("map|")), JSON.stringify(await items()));
await typed(" x");

// click away
await typed("\nk = fi");
check("popup open again for a new word", (await items()).length > 0);
const sig = await rect("h1.signature");
await B.click(sig.x + 5, sig.y + sig.h / 2); await sleep(200);
check("clicking elsewhere closes the popup", (await items()).length === 0);
await focusEditor();
await B.press("End"); await sleep(50);
await typed("l");
check("popup opens again after clicking back", (await items()).length > 0, JSON.stringify(await items()));
const firstLine = await rect(".cm-line");
await B.click(firstLine.x + 60, firstLine.y + 5); await sleep(200);
check("clicking elsewhere in the editor closes the popup", (await items()).length === 0);
await B.press("Escape"); // nothing open now
await sleep(100);
const menuAfterSecondEsc = await menuOpen();
check("with no popup open, Esc opens the menu as before", menuAfterSecondEsc === true);
// a new Run for the rest (the menu's Repeat Puzzle)
await B.ev(`document.querySelector('button[title="Repeat Puzzle"]').click()`);
await sleep(300);
counted = [];

// --- the key-press recorder: a whole Run ------------------------------------------------------------
await focusEditor();
await typed("f = tak");
await sleep(200);
await accept("Tab");
await typed("e xs\ng = dr");
await sleep(200);
await accept("Enter");
await typed("op xs\n-- PASS");
await sleep(800);
const record = await B.ev(`(() => { const runs = JSON.parse(localStorage.getItem('type-solution.runs') || '[]'); return runs[runs.length - 1] ?? null; })()`);
check("the Run passed and was saved", record && record.language === "purescript", JSON.stringify(record)?.slice(0, 120));
if (record) {
  check("the solution includes the import line", record.solution.startsWith("import Data.Array (take, drop)"), JSON.stringify(record.solution));
  check("the Run record's key presses are exactly what was typed: the accepting Tab and Enter and the import line are not in it", record.keys === counted.join(""), JSON.stringify({ keys: record.keys, expected: counted.join("") }));
  check("so fewer presses than the document has characters", record.keys.length < record.solution.length, `${record.keys.length} < ${record.solution.length}`);
  check("no Tab in the record", !record.keys.includes("\t"));
}
await shot("passed");

// --- a second Run: undo, early Tab, import line, JavaScript, switching -------------------------------
await B.ev(`document.querySelector('button[title="Repeat Puzzle"]').click()`);
await sleep(300);
await focusEditor();
// How soon after the last letter can Tab come and still accept? (A person's
// fastest letter-to-Tab gap is tens of milliseconds.)
const accepted = {};
for (const gap of [0, 5, 10, 20, 40]) {
  await B.press("a", [MOD]); await B.press("Backspace"); await sleep(100);
  await B.typeChar("f"); await B.typeChar(" "); for (const c of "tak") await B.typeChar(c);
  if (gap > 0) await sleep(gap);
  await B.press("Tab"); await sleep(250);
  accepted[gap] = (await doc()) === "import Data.Array (take)\n\nf tak";
}
console.log("Tab after the last letter, by gap in ms (true = accepted, false = indented):", JSON.stringify(accepted));
check("a Tab 20 ms or more after the letters still accepts (activateOnTypingDelay and interactionDelay are 0)", accepted[20] && accepted[40]);
await B.press("a", [MOD]); await B.press("Backspace"); await sleep(100);
for (const c of "f tak") await B.typeChar(c);
await sleep(200);
await accept("Tab");
await B.press("z", [MOD]); await sleep(150);
check("undo reverts only the import edit, in one step; the typed letters stay", (await doc()) === "f tak", JSON.stringify(await doc()));

await typed("\nimport ta");
check("never on an import line: no popup there", (await items()).length === 0, JSON.stringify(await items()));
await B.press("Escape"); await sleep(50);

// reset to a clean editor: Repeat Puzzle (menu is open now)
await B.ev(`document.querySelector('button[title="Repeat Puzzle"]').click()`);
await sleep(300);
await focusEditor();
await typed("f :: forall a. a -> a\nf x = x -- ok");
const colour = (text) => B.ev(`(() => { const s = [...document.querySelectorAll('.cm-line span')].find(e => e.textContent === ${JSON.stringify(text)}); return s ? getComputedStyle(s).color : null; })()`);
const plain = await B.ev(`getComputedStyle(document.querySelector('.cm-content')).color`);
const kw = await colour("forall"), arrow = await colour("::"), com = await colour("-- ok");
check("Editor mode: forall and :: are coloured as keywords, a comment as a comment", kw && arrow && com && kw !== plain && kw === arrow && com !== plain && com !== kw, JSON.stringify({ plain, kw, arrow, com }));
await typed("\ng y =");
await B.press("Enter"); counted.push("\n"); await sleep(100);
check("Enter after `=` indents one unit", (await doc()).split("\n").at(-1) === "  ", JSON.stringify((await doc()).split("\n").at(-1)));
await B.press("Backspace"); await B.press("Backspace"); await sleep(100);

// JavaScript: no popup, Tab still indents; switching swaps only the mode
await B.ev(`document.querySelector('button[title="Repeat Puzzle"]').click()`);
await sleep(300);
await focusEditor();
await typed("f = tak");
await sleep(250);
const withPopup = (await items()).length > 0;
await pickLanguage("JavaScript"); await sleep(300);
check("switching Language with the popup open closes it", withPopup && (await items()).length === 0);
check("JavaScript shows its own (empty) draft", (await lang()) === "JavaScript" && (await doc()) === "");
await focusEditor();
await typed("let ta");
await sleep(300);
check("JavaScript: typing a known name shows no popup", (await items()).length === 0, JSON.stringify(await items()));
await B.press("Home"); await B.press("Tab"); await sleep(150);
check("JavaScript: Tab still indents", (await doc()) === "  let ta", JSON.stringify(await doc()));
await pickLanguage("PureScript (test)"); await sleep(300);
check("back in PureScript: its draft is exactly as it was left", (await doc()) === "f = tak", JSON.stringify(await doc()));
await focusEditor();
await B.press("End"); await typed("e");
check("and the popup works again after switching back", (await items()).length > 0, JSON.stringify(await items()));
await accept("Tab");
check("accepting after a switch back adds the import", (await doc()) === "import Data.Array (take)\n\nf = take", JSON.stringify(await doc()));
await pickLanguage("JavaScript"); await sleep(200);
check("the JavaScript draft survived", (await doc()) === "  let ta", JSON.stringify(await doc()));

// --- constructors (ticket 39): Just and Nothing import Maybe(..) --------------------------------------
await pickLanguage("PureScript (test)"); await sleep(300);
const clear = async () => { await B.press("a", [MOD]); await B.press("Backspace"); await sleep(100); };
await focusEditor();
await clear();
await typed("f = Jus");
await sleep(250);
list = await items();
check("typing Jus offers Just with its module Data.Maybe", list.includes("Just|Data.Maybe"), JSON.stringify(list));
await shot("constructor-just");
await accept("Tab");
check("Tab on Just adds import Data.Maybe (Maybe(..)), the typed letters untouched", (await doc()) === "import Data.Maybe (Maybe(..))\n\nf = Jus", JSON.stringify(await doc()));
await typed("t x\ng = Jus");
await sleep(200);
check("with Maybe(..) imported, Just is not offered again", !(await items()).some((t) => t.startsWith("Just|")), JSON.stringify(await items()));
await clear();
await typed("f = Noth");
await sleep(250);
list = await items();
check("typing Noth offers Nothing with Data.Maybe", list.includes("Nothing|Data.Maybe"), JSON.stringify(list));
await accept("Enter");
check("Enter on Nothing adds import Data.Maybe (Maybe(..))", (await doc()) === "import Data.Maybe (Maybe(..))\n\nf = Noth", JSON.stringify(await doc()));
await clear();
await typed("import Data.Maybe (fromMaybe)\nf = Not");
await sleep(250);
// Recorded, not a check: after only "Not" the six places go to Not (two type-level
// classes) and note, notElem (names sort alphabetically, ignoring case), so Nothing
// shows from "Noth" on. The order is the owner's to change (ticket 39, questions).
console.log("popup after `Not`:", JSON.stringify(await items()));
await typed("h");
list = await items();
check("typing Noth with fromMaybe imported offers Nothing", list.includes("Nothing|Data.Maybe"), JSON.stringify(list));
await shot("constructor-merge");
await accept("Tab");
check("accepting merges: import Data.Maybe (fromMaybe, Maybe(..))", (await doc()) === "import Data.Maybe (fromMaybe, Maybe(..))\nf = Noth", JSON.stringify(await doc()));
await clear();
await typed("import Data.Maybe (Maybe)\nf = Jus");
await sleep(250);
await accept("Tab");
check("a bare Maybe becomes Maybe(..), not a second entry", (await doc()) === "import Data.Maybe (Maybe(..))\nf = Jus", JSON.stringify(await doc()));
await clear();
await typed("f :: May");
await sleep(250);
list = await items();
check("typing the type name offers it from Data.Maybe", list.includes("Maybe|Data.Maybe"), JSON.stringify(list));
await accept("Tab");
check("accepting the type name imports Maybe(..) too", (await doc()) === "import Data.Maybe (Maybe(..))\n\nf :: May", JSON.stringify(await doc()));
await clear();

// the popup in the dark scheme (a look, for the screenshot)
await B.dark();
await pickLanguage("PureScript (test)"); await sleep(200);
await B.press("a", [MOD]); await B.press("Backspace");
await typed("g = fil");
await shot("popup-dark");
check("the popup is readable in the dark scheme (its colours come from the editor's variables)", await B.ev(`(() => { const t = document.querySelector('.cm-tooltip-autocomplete'); return !!t && getComputedStyle(t).backgroundColor === getComputedStyle(document.querySelector('.cm-editor')).backgroundColor; })()`));

await B.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${B.name}: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
