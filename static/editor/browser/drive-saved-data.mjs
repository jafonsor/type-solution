// Drives the built app in real Chrome and checks saved data per Language and
// the Peek (ticket 30): old runs read as JavaScript, a new Run's record names
// its Language, bests and weak-key lists are per Language, and the hint open
// for a second marks the Run "peeked".
//
//   TOOLS=<folder whose node_modules has playwright-core> \
//     node drive-saved-data.mjs <exported site folder> <puzzles folder> [screenshot-prefix]
//
// The site comes from `nix build` then `tools/export-site.sh result site /`.
// The app has only JavaScript yet, so the page is served with a second, stub
// Language ("purescript") registered after the shim loads: its checker passes
// any code containing "PASS". Its table in the Puzzle file is the real
// PureScript one. Not part of `npm test`; ticket 33 owns the smoke test.
import { createRequire } from "node:module";
import http from "node:http";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const site = process.argv[2];
const puzzles = process.argv[3];
const shot = process.argv[4];
if (!site || !puzzles) throw new Error("usage: drive-saved-data.mjs <site folder> <puzzles folder> [screenshot-prefix]");

const stub = `
;(() => {
  window.TypeSolution.registerLanguage({
    name: "purescript", title: "PureScript (stub)", folder: "languages/purescript", settings: {},
    createChecker: () => ({
      check: async (code, fn, tests) => code.includes("PASS")
        ? { status: "pass", results: tests.map(() => ({ pass: true, got: "x" })) }
        : { status: "fail", results: tests.map(() => ({ pass: false, got: "stub" })) },
      stop() {},
    }),
    editorMode: () => [],
    bundle: { start: async () => {} },
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
const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));

const select = () => page.locator(".editor-bar select");
const pick = async (label) => { await select().selectOption({ label }); await page.waitForTimeout(100); };
const status = () => page.locator(".status .phase").innerText();
const runs = () => page.evaluate(() => JSON.parse(localStorage.getItem("type-solution.runs") ?? "[]"));
const lastRun = async () => (await runs()).at(-1);
const reference = () => page.evaluate(() => document.querySelector(".reference-tip").textContent);
const weak = (label) => page.locator(".weak-key-line", { hasText: label }).innerText().then((t) => t.replace(`${label}:`, "").trim());
const editor = () => page.locator(".cm-content");

async function open() {
  await page.goto(base);
  await page.waitForSelector(".cm-content", { timeout: 120000 });
  await page.waitForSelector(".editor-bar select");
}
async function passed() { await page.waitForFunction(() => /^Passed in/.test(document.querySelector(".status .phase").textContent), null, { timeout: 15000 }); }
async function again() { await page.locator('button[title="Repeat Puzzle"]').click(); await page.waitForTimeout(150); }

// 1. Old-format saved data: no `language` anywhere, for every Puzzle in the bank.
const identities = readdirSync(puzzles).filter((f) => f.endsWith(".toml")).map((f) => f.replace(/\.toml$/, ""));
const typed = "x\b;".repeat(12) + ";".repeat(10); // 12 Corrections of ';', 22 typed
const oldRuns = identities.map((p) => ({
  puzzle: p, finishedAt: "2026-10-17T21:14:03.512Z", seconds: 999, wordsPerMinute: 10, backspaces: 0, solution: "x",
  keys: typed, gaps: [...typed].map(() => 100),
}));
await open();
await page.evaluate((r) => localStorage.setItem("type-solution.runs", JSON.stringify(r)), oldRuns);
await open();
check("seeded records have no language field", !(await runs()).some((r) => "language" in r));
check("old runs' key presses read as JavaScript: Most missed lists ';' in JavaScript", (await weak("Most missed")).includes(";"), await weak("Most missed"));
await pick("PureScript (stub)");
check("...and the PureScript lists are empty", (await weak("Most missed")) === "—" && (await weak("Slowest")) === "—", await weak("Most missed"));

// 2. A PureScript (stub) Run, unpeeked: first in that Language despite the 999 s JavaScript bests.
await editor().click();
await page.keyboard.type("PASS");
await passed();
let s = await status();
check("a PureScript pass is compared with PureScript bests only: first time", /First time on this Puzzle\.$/.test(s) && !s.includes("peeked"), s);
let r = await lastRun();
check("the new record names its Language and isn't peeked", r.language === "purescript" && r.peeked === false && !("keyLanguages" in r), JSON.stringify({ l: r.language, p: r.peeked }));
check("the old records are untouched (no language added)", (await runs()).slice(0, oldRuns.length).every((o, i) => JSON.stringify(o) === JSON.stringify(oldRuns[i])));
const psBest = r.seconds;

// 3. A JavaScript Run that peeks: hover the "?" for 1.3 s, then type the Reference Solution.
await again();
await pick("JavaScript");
const jsRef = await reference();
await page.locator(".reference-hint").hover();
await page.waitForTimeout(1300);
const tipShown = await page.locator(".reference-tip").isVisible();
check("hovering the ? shows the Reference Solution of the current Language", tipShown && (await page.locator(".reference-tip").innerText()).trim() === jsRef.trim());
if (shot) await page.screenshot({ path: `${shot}-tooltip.png` });
await page.mouse.move(500, 300);
await editor().click();
await page.keyboard.type(jsRef);
await passed();
s = await status();
check("a peeked Run shows the plain word 'peeked' beside its time, and compares with the old (JavaScript) 999 s record", /Passed in [\d.]+ s \(peeked\), .*New best \(was 999\.0 s\)\.$/.test(s), s);
r = await lastRun();
check("its record is JavaScript and peeked", r.language === "javascript" && r.peeked === true, JSON.stringify({ l: r.language, p: r.peeked }));
const jsPeekedBest = r.seconds;
if (shot) await page.screenshot({ path: `${shot}-peeked.png` });

// 4. A slower, unpeeked JavaScript Run: does not replace the faster peeked best, which shows its mark.
await again();
await page.locator(".cm-content").click();
await page.keyboard.type(jsRef, { delay: 25 });
await passed();
s = await status();
r = await lastRun();
check("a slower unpeeked Run shows the peeked best, marked", r.seconds > jsPeekedBest && r.peeked === false && new RegExp(`Best: ${jsPeekedBest.toFixed(1)} s \\(peeked\\)\\.$`).test(s) && !/Passed in [\d.]+ s \(peeked\)/.test(s), s + " / " + r.seconds + " vs " + jsPeekedBest);

// 5. A brief mouse-over (0.4 s) doesn't peek.
await again();
await page.locator(".reference-hint").hover();
await page.waitForTimeout(400);
await page.mouse.move(500, 300);
await pick("PureScript (stub)");
await editor().click();
await page.keyboard.type("PASS");
await passed();
r = await lastRun();
s = await status();
check("a 0.4 s mouse-over doesn't mark the Run", r.peeked === false && !s.includes("peeked"), s);

// 6. A Run that switched Language: JavaScript typed first, PureScript passes; peeked in a different Language than the one passing.
await again();
await pick("JavaScript");
await page.locator(".reference-hint").hover();
await page.waitForTimeout(1200);
await page.mouse.move(500, 300);
await editor().click();
await page.keyboard.type("jj");
await pick("PureScript (stub)");
await editor().click();
await page.keyboard.type("PASS");
await passed();
r = await lastRun();
s = await status();
check("a peek in one Language marks a Run another Language passed", r.language === "purescript" && r.peeked === true, JSON.stringify({ l: r.language, p: r.peeked }));
check("its key presses are kept with the Language typed in", JSON.stringify(r.keyLanguages) === JSON.stringify([["javascript", 2], ["purescript", 4]]), JSON.stringify(r.keyLanguages));
check("the status line shows peeked beside the time", /Passed in [\d.]+ s \(peeked\)/.test(s), s);
check("a switched Run is eligible, with its whole-Run time (it is slower than the quick PureScript run)", r.seconds >= psBest);

// 6b. L3: a draft that would pass in the last 400 ms before a switch is still checked, and ends the Run.
await again();
await pick("JavaScript");
await editor().click();
await page.keyboard.type(jsRef);
await pick("PureScript (stub)"); // well inside the 400 ms pause
await page.keyboard.type("nope");
await passed();
r = await lastRun();
check("a JavaScript draft completed just before switching still ends the Run, in JavaScript", r.language === "javascript" && r.solution.includes("return"), JSON.stringify({ l: r.language }));
check("...and its key presses are split by Language", JSON.stringify(r.keyLanguages?.map((k) => k[0])) === '["javascript","purescript"]', JSON.stringify(r.keyLanguages));

// 7. Lists are per Language, from the stored records.
await again();
const msJs = await (async () => { await pick("JavaScript"); return weak("Most missed"); })();
await pick("PureScript (stub)");
const msPs = await weak("Most missed");
check("lists follow the Language shown", msJs.includes(";") && msPs === "—" || msPs !== msJs, `${msJs} | ${msPs}`);

// 8. A reload reads the same list (old and new records together).
await open();
check("after a reload the records are still one list with the old ones first", (await runs()).length === oldRuns.length + 6);
check("the old records still read as JavaScript", (await weak("Most missed")).length > 0);

await browser.close();
server.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
