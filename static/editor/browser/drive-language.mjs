// Drives the built app in real Chrome and checks the Language dropdown, Alt+L,
// per-Language drafts, the clock and the remembered choice (ticket 29).
//
//   TOOLS=<folder whose node_modules has playwright-core> \
//     node drive-language.mjs <exported site folder> [screenshot.png]
//
// The site comes from `nix build` then `tools/export-site.sh result site /`.
// The app has only JavaScript yet, so the page is served with a second,
// stub Language ("purescript": no highlighting, a checker that always fails)
// registered after the shim loads; its table in the Puzzle file is the real
// PureScript one. Not part of `npm test`; ticket 33 owns the smoke test.
import { createRequire } from "node:module";
import http from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const site = process.argv[2];
const shot = process.argv[3];
if (!site) throw new Error("usage: drive-language.mjs <site folder> [screenshot.png]");

const stub = `
;(() => {
  window.__bundleStarts = [];
  window.TypeSolution.registerLanguage({
    name: "purescript", title: "PureScript (stub)", folder: "languages/purescript", settings: {},
    createChecker: () => ({
      check: async () => ({ status: "fail", message: "", line: 1, column: 0, results: [{ pass: false, got: "stub" }] }),
      stop() {},
    }),
    editorMode: () => [],
    bundle: { start: async () => { window.__bundleStarts.push("purescript"); } },
  });
})();
`;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = http.createServer((q, r) => {
  let path = decodeURIComponent(q.url.split("?")[0]);
  let file = join(site, path === "/" ? "index.html" : path);
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); statSync(file); } catch { r.writeHead(404); return r.end(); }
  if (/editor\.js$/.test(path)) {
    r.writeHead(200, { "content-type": "text/javascript" });
    return r.end(readFileSync(file, "utf8") + stub);
  }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));

const select = () => page.locator(".editor-bar select");
// The dropdown's option values are positions, so read the selected label.
const shown = () => select().evaluate((s) => ({ "JavaScript": "javascript", "PureScript (stub)": "purescript" })[s.selectedOptions[0].textContent]);
const text = () => page.locator(".cm-content").innerText().then((t) => t.replace(/​/g, "").trim());
const signature = () => page.locator("h1.signature").innerText();
const clock = async () => parseFloat((await page.locator(".clock").innerText()).replace(" s", ""));
const stored = () => page.evaluate(() => localStorage.getItem("type-solution.language"));
const starts = () => page.evaluate(() => window.__bundleStarts);

async function open() {
  await page.goto(base);
  await page.waitForSelector(".cm-content", { timeout: 120000 });
  await page.waitForSelector(".editor-bar select");
}

await open();
check("first visit opens in JavaScript", (await shown()) === "javascript" && (await stored()) === null);
check("the dropdown lists the registry's Languages", JSON.stringify(await select().locator("option").allInnerTexts()) === JSON.stringify(["JavaScript", "PureScript (stub)"]));
check("the bar sits directly under the editor, the select at its right edge", await page.evaluate(() => {
  const e = document.querySelector(".editor").getBoundingClientRect();
  const b = document.querySelector(".editor-bar").getBoundingClientRect();
  const s = document.querySelector(".editor-bar select").getBoundingClientRect();
  return Math.abs(b.top - e.bottom) < 2 && b.right - s.right < 16 && Math.abs(b.left - e.left) < 2;
}));
const jsSignature = await signature();
check("JavaScript shows its signature", !jsSignature.includes("::"), JSON.stringify(jsSignature));
check("the bundle trigger starts nothing for JavaScript", (await starts()).length === 0);

// Type in JavaScript; the clock starts at the first key.
await page.locator(".cm-content").click();
await page.keyboard.type("jsdraft");
await page.waitForTimeout(1300);
const before = await clock();
check("the clock runs after the first keystroke", before >= 1, before + " s");

// Pick PureScript from the dropdown.
await select().selectOption({ label: "PureScript (stub)" });
await page.waitForTimeout(100);
const psSignature = await signature();
check("picking PureScript swaps the signature to its table's", psSignature.includes("::") && psSignature !== jsSignature, JSON.stringify(psSignature));
check("an untouched Language opens empty", (await text()) === "", JSON.stringify(await text()));
check("the choice is remembered", (await stored()) === "purescript");
check("the first pick starts that Language's bundle, once", JSON.stringify(await starts()) === '["purescript"]');
const afterSwitch = await clock();
check("switching does not reset the clock", afterSwitch >= before, `${before} -> ${afterSwitch}`);

await page.locator(".cm-content").click();
await page.keyboard.type("psdraft");
await page.waitForTimeout(300);
// Alt+L from inside the editor.
await page.keyboard.press("Alt+KeyL");
await page.waitForTimeout(100);
check("Alt+L cycles to JavaScript", (await shown()) === "javascript" && (await signature()) === jsSignature);
check("the JavaScript draft survived the switch", (await text()) === "jsdraft", JSON.stringify(await text()));
check("Alt+L typed nothing", !(await text()).includes("¬"));
await page.keyboard.press("Alt+KeyL");
await page.waitForTimeout(100);
check("Alt+L cycles back; the PureScript draft survived", (await shown()) === "purescript" && (await text()) === "psdraft", JSON.stringify(await text()));
check("the remembered choice follows Alt+L", (await stored()) === "purescript");
check("later picks don't download again", JSON.stringify(await starts()) === '["purescript"]');
const later = await clock();
check("the clock kept running through every switch", later >= afterSwitch + 0.2, `${afterSwitch} -> ${later}`);
if (shot) await page.screenshot({ path: shot });

// Undo stays inside a Language.
await page.keyboard.press("Alt+KeyL");
await page.locator(".cm-content").click();
await page.keyboard.press("Meta+KeyZ");
await page.keyboard.press("Control+KeyZ");
check("undo never reaches into another Language's text", !(await text()).includes("psdraft"), JSON.stringify(await text()));
await page.keyboard.press("Alt+KeyL"); // back to PureScript

// Reload: a fresh Run in the remembered Language.
await open();
check("reload opens in the remembered Language", (await shown()) === "purescript");
check("reload starts a fresh Run: empty editor, clock at zero", (await text()) === "" && (await clock()) === 0);
check("reload with a bundled Language remembered starts its download at load", JSON.stringify(await starts()) === '["purescript"]');
check("reload shows that Language's signature", (await signature()).includes("::"));
await page.locator(".cm-content").click();
await page.keyboard.press("Alt+KeyL");
await page.waitForTimeout(100);
check("the JavaScript draft did not survive the reload", (await text()) === "" && (await shown()) === "javascript");
await page.keyboard.press("Alt+KeyL"); // purescript

// Pause: the editor is read-only, so the Language is fixed; a new Run drops drafts.
await page.locator(".cm-content").click();
await page.keyboard.type("keepme");
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check("while the menu is open the dropdown is disabled", await select().isDisabled());
await page.locator('button[title="Repeat Puzzle"]').click();
await page.waitForTimeout(200);
check("a new Run keeps the Language and empties the editor", (await shown()) === "purescript" && (await text()) === "");
await page.keyboard.press("Alt+KeyL");
await page.keyboard.press("Alt+KeyL");
check("a new Run dropped the drafts", (await text()) === "");

// Unknown saved value.
await page.evaluate(() => localStorage.setItem("type-solution.language", "klingon"));
await open();
check("an unknown saved value opens in JavaScript", (await shown()) === "javascript");

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
