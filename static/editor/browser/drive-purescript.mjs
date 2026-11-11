// Drives the EXPORTED app (with its PureScript bundle) in real Chrome and checks
// the PureScript Checker end to end (ticket 31): picking PureScript from the
// real dropdown, the loading line with a percentage, typing while it loads, the
// first check running when loading finishes, a passing Reference Solution ending
// the Run, a type error and a syntax error with their status line, hover and
// underlines, the underline option in the menu (Tab, Space, stored), underlines
// going on the next edit, the import popup working while the compiler loads,
// switching Language and back, reload with PureScript remembered, and a failed
// download with a retry, and the warm-up (ticket 38): the libraries a Puzzle's
// Reference Solution imports are fetched with no typing, at load and for each
// new Puzzle, only for PureScript, with nothing shown, and a JavaScript-only
// page starts no compiler worker and requests nothing under purs/.
//
//   TOOLS=<folder whose node_modules has playwright-core> \
//     node drive-purescript.mjs <site folder exported with BASE=/type-solution/ and a purs bundle> [screenshot-prefix]
//
// The site comes from `nix build -o app`, `nix build .#purs-bundle -o pb`, then
// `tools/export-site.sh app site /type-solution/ pb`. Not part of `npm test`
// (needs Chrome and playwright-core). The permanent, small one run in CI is smoke-purescript.mjs (ticket 33).
import { createRequire } from "node:module";
import http from "node:http";
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { librariesFor, importedModules } from "../../bundle/purs-tree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const need = createRequire(join(process.env.TOOLS ?? ".", "x.js"));
const { chromium } = need("playwright-core");
const { parse: parseToml } = createRequire(join(repo, "tools/puzzle-check/x.js"))("smol-toml");
const site = process.argv[2];
const shotPrefix = process.argv[3];
if (!site) throw new Error("usage: drive-purescript.mjs <site folder> [screenshot-prefix]");
const BASE = "/type-solution/";
const only = process.env.ONLY?.split(",") ?? null; // e.g. ONLY=3,5: just those sections
const section = (n) => !only || only.includes(String(n));

// Every Puzzle's PureScript table, to find the Reference Solution of the Puzzle the page picked.
const puzzles = readdirSync(join(repo, "puzzles")).filter((n) => n.endsWith(".toml")).map((n) => {
  const doc = parseToml(readFileSync(join(repo, "puzzles", n), "utf8"));
  return { id: n.slice(0, -5), signature: doc.purescript.signature, reference: doc.purescript.reference, fn: doc.function };
});

// --- a static server like Pages, with knobs for the download ---------------------------------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".gz": "application/gzip" };
const knobs = { slowCompiler: false, failCompiler: 0, requests: [] };
const server = http.createServer(async (q, r) => {
  const path = decodeURIComponent(q.url.split("?")[0]);
  knobs.requests.push(path);
  if (process.env.TRACE && path.includes("/purs/")) console.log("  request", Date.now() % 100000, path.split("/").pop());
  if (!path.startsWith(BASE)) { r.writeHead(404); return r.end(); }
  let file = join(resolve(site), path.slice(BASE.length) || "index.html");
  try { if (statSync(file).isDirectory()) file = join(file, "index.html"); statSync(file); } catch { r.writeHead(404); return r.end(); }
  if (/\/purs-core\.[0-9a-f]+\.wasm$/.test(path)) {
    if (knobs.failCompiler > 0) { knobs.failCompiler--; r.writeHead(500); return r.end("broken"); }
    if (knobs.slowCompiler) {
      const bytes = readFileSync(file);
      r.writeHead(200, { "content-type": "application/wasm", "content-length": bytes.length });
      const step = Math.ceil(bytes.length / 12);
      for (let at = 0; at < bytes.length; at += step) {
        r.write(bytes.subarray(at, at + step));
        await new Promise((done) => setTimeout(done, 250));
      }
      return r.end();
    }
  }
  r.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(r);
}).listen(0);
const origin = `http://localhost:${server.address().port}`;
const url = origin + BASE;

const results = [];
// The editor shows an empty line as a blank line of its own in innerText: compare modulo blank lines.
const squash = (t) => t.replace(/\n+/g, "\n");
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const browser = await chromium.launch({ channel: "chrome" });
console.log("Chrome", browser.version());

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR", (e.stack ?? e.message).split("\n").slice(0, 6).join(" | ")));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR", m.text()); });
  const api = {
    page, context,
    select: () => page.locator(".editor-bar select"),
    status: () => page.locator(".status .phase").innerText(),
    title: () => page.locator(".status .phase").getAttribute("title"),
    signature: () => page.locator("h1.signature").innerText(),
    underlined: () => page.locator(".cm-error-underline").allInnerTexts(),
    text: () => page.locator(".cm-content").innerText().then((t) => t.replace(/​/g, "")),
    stored: (key) => page.evaluate((k) => localStorage.getItem(k), key),
    shot: (name) => shotPrefix && page.screenshot({ path: `${shotPrefix}-${name}.png` }),
    async open() {
      await page.goto(url);
      await page.waitForSelector(".cm-content", { timeout: 120000 });
      await page.waitForSelector(".editor-bar select");
    },
    // The compiler is in Cache Storage, whole: the download has finished.
    async cached() {
      for (let i = 0; i < 600; i++) {
        const size = await page.evaluate(async () => {
          const cache = await caches.open("purs-bundle");
          const key = (await cache.keys()).find((r) => /purs-core/.test(r.url));
          return key ? (await (await cache.match(key)).arrayBuffer()).byteLength : 0;
        });
        if (size > 20e6) return;
        await page.waitForTimeout(100);
      }
      throw new Error("the compiler never reached Cache Storage");
    },
    async waitStatus(re, timeout = 60000) {
      await page.waitForFunction((s) => new RegExp(s).test(document.querySelector(".status .phase")?.textContent ?? ""), re.source, { timeout });
      return api.status();
    },
    // Replaces the document (one input event, so auto-indent does not add to what is given).
    async put(code) {
      await page.locator(".cm-content").click();
      // Select all: Cmd+A on a Mac (where Ctrl+A is "line start"), Ctrl+A elsewhere.
      await page.keyboard.press(process.platform === "darwin" ? "Meta+KeyA" : "Control+KeyA");
      await page.keyboard.press("Backspace");
      await page.keyboard.insertText(code);
    },
    reference: async () => {
      await page.waitForFunction(() => document.querySelector("h1.signature")?.textContent.includes("::"), null, { timeout: 10000 });
      const sig = (await api.signature()).trim();
      return puzzles.find((p) => p.signature.trim() === sig);
    },
  };
  return api;
}

// ============ 1. First visit, JavaScript: nothing under purs/ ===========================
if (section(1)) {
  const t = await newPage();
  const compilerWorkers = [];
  t.page.on("worker", (w) => { if (/purs-compiler/.test(w.url())) compilerWorkers.push(w.url()); });
  knobs.requests = [];
  await t.open();
  check("the dropdown lists JavaScript and PureScript", JSON.stringify(await t.select().locator("option").allInnerTexts()) === '["JavaScript","PureScript"]');
  await t.page.waitForTimeout(1500);
  check("a JavaScript-only page makes no request under purs/", knobs.requests.filter((p) => p.startsWith(BASE + "purs/")).length === 0, JSON.stringify(knobs.requests.filter((p) => p.includes("purs/"))));
  // New Puzzles open without any warm-up for JavaScript.
  for (let i = 0; i < 8; i++) { await t.page.evaluate(() => document.querySelector('button[title="New random Puzzle"]').click()); await t.page.waitForTimeout(150); }
  await t.page.waitForTimeout(500);
  check("...nor after new Puzzles open (no warm-up for JavaScript)", knobs.requests.filter((p) => p.includes("/purs/")).length === 0 && compilerWorkers.length === 0, JSON.stringify([knobs.requests.filter((p) => p.includes("/purs/")), compilerWorkers]));
  await t.context.close();
}

// ============ 2. Pick PureScript: loading line, typing while it loads, first check ============
if (section(2)) {
  const t = await newPage();
  knobs.slowCompiler = true;
  await t.open();
  knobs.requests = [];
  await t.select().selectOption({ label: "PureScript" });
  const loading = await t.waitStatus(/^Loading PureScript compiler…/, 10000);
  check("the status line reads \"Loading PureScript compiler…\"", loading.startsWith("Loading PureScript compiler…"), loading);
  const withPercent = await t.waitStatus(/^Loading PureScript compiler… \d+%$/, 10000);
  check("with a percentage while it comes in", /\d+%$/.test(withPercent), withPercent);
  await t.shot("loading");
  // The player keeps typing; the import popup works with the name table alone (the compiler is still coming).
  const puzzle = await t.reference();
  check("PureScript shows its signature from the Puzzle's table", !!puzzle, await t.signature());
  await t.page.locator(".cm-content").click();
  await t.page.keyboard.type("tak", { delay: 30 });
  await t.page.waitForSelector(".cm-tooltip-autocomplete", { timeout: 8000 }).catch(() => {});
  const popup = await t.page.locator(".cm-tooltip-autocomplete").innerText().catch(() => "");
  check("the import popup works while the compiler is still loading", /take/.test(popup) && /Data\.Array/.test(popup), JSON.stringify(popup.slice(0, 80)));
  check("...and it did so before the compiler had arrived", (await t.status()).startsWith("Loading PureScript compiler"), await t.status());
  await t.page.keyboard.press("Tab");
  check("Tab adds the import line", (await t.text()).startsWith("import Data.Array (take)"), JSON.stringify(await t.text()));
  // Make it a whole Reference Solution while the compiler loads.
  await t.put(puzzle.reference);
  check("typing works while loading", (await t.text()).includes(puzzle.fn), "");
  check("still loading when the player stopped typing", (await t.status()).startsWith("Loading PureScript compiler"), await t.status());
  // Loading finishes; the first check runs without another edit, and passes: the Run ends.
  const done = await t.waitStatus(/^Passed in /, 90000);
  check("the first check ran when loading finished, and the Reference Solution passed", /^Passed in /.test(done), done);
  check("the Run ended: the menu is open", !(await t.page.locator(".menu").getAttribute("hidden").catch(() => null)) === true || (await t.page.locator(".menu").isVisible()));
  await t.shot("passed");
  check("the compiler was fetched once", knobs.requests.filter((p) => /purs-core/.test(p)).length === 1, JSON.stringify(knobs.requests.filter((p) => /purs-core/.test(p))));
  knobs.slowCompiler = false;
  check("PureScript is remembered", (await t.stored("type-solution.language")) === "purescript");
  await t.context.close();
}

// ============ 3. Errors, underlines, the option ============
if (section(3)) {
  const t = await newPage();
  await t.open();
  await t.select().selectOption({ label: "PureScript" });
  await t.waitStatus(/^Start typing/, 60000);

  // A type error: the signature promises Int but the body is a String.
  const typeCode = `import Prelude\n\nf :: Int\nf = "oops"\n`;
  await t.put(typeCode);
  const typeStatus = await t.waitStatus(/^doesn't type-check yet: /, 60000);
  check("a type error: \"doesn't type-check yet: line L, column C: message\"", /^doesn't type-check yet: line 4, column 5: Could not match type String with type Int/.test(typeStatus), typeStatus);
  const under = await t.underlined();
  check("...and the offending text is underlined", under.join("") === '"oops"', JSON.stringify(under));
  const hover = await t.title();
  check("...hovering the status line shows the error in full", /line 4, column \d+/.test(hover ?? "") && /Could not match type/.test(hover), JSON.stringify(hover));
  const statusHeight = await t.page.locator(".status .phase").evaluate((e) => e.getBoundingClientRect().height);
  check("...as one line", statusHeight < 40, statusHeight + "px");
  await t.shot("type-error");

  // The next edit clears the underline; the status message stays through the edit's pause.
  await t.page.keyboard.press("End");
  await t.page.keyboard.insertText(" ");
  check("underlines disappear on the next edit", (await t.underlined()).length === 0);
  await t.page.waitForFunction(() => document.querySelector(".status .phase").textContent === "", null, { timeout: 5000 }); // typing again
  await t.waitStatus(/^doesn't type-check yet: /, 20000);
  check("...and appear again when the new check finishes", (await t.underlined()).length === 1, JSON.stringify([await t.underlined(), await t.status(), await t.text()]));

  // A syntax error: the break is the line before the one the compiler reports.
  const synCode = `import Prelude\n\nf :: Int -> Int\nf x = (x +\n\n`;
  await t.put(synCode);
  const synStatus = await t.waitStatus(/^doesn't parse yet: /, 60000);
  check("a syntax error: \"doesn't parse yet: line L, column C: message\"", /^doesn't parse yet: line 4, column 10: Unable to parse module/.test(synStatus), synStatus);
  const synUnder = await t.underlined();
  check("...underlined at the end of the last non-blank line before the reported position", synUnder.join("") === "+", JSON.stringify(synUnder));
  await t.shot("syntax-error");

  // The option: Esc opens the menu; the checkbox is reachable by Tab after the two buttons and Space flips it.
  await t.page.keyboard.press("Escape");
  await t.page.waitForTimeout(300);
  const box = t.page.locator(".menu .option input[type=checkbox]");
  check("the menu has the checkbox \"Show error underlines\", on by default", (await box.isChecked()) && /Show error underlines/.test(await t.page.locator(".menu .option").innerText()));
  const order = await t.page.evaluate(() => [...document.querySelectorAll(".menu > *")].map((e) => e.tagName));
  check("it comes after the two buttons", JSON.stringify(order) === '["BUTTON","BUTTON","LABEL"]', JSON.stringify(order));
  const focusedFirst = await t.page.evaluate(() => document.activeElement?.getAttribute("title"));
  await t.page.keyboard.press("Tab");
  await t.page.keyboard.press("Tab");
  check("Tab reaches it from the first button", await t.page.evaluate(() => document.activeElement?.type === "checkbox"), focusedFirst);
  await t.page.keyboard.press("Space");
  check("Space flips it", !(await box.isChecked()));
  check("the choice is stored first in type-solution.options", (await t.stored("type-solution.options")) === '{"underlines":false}', await t.stored("type-solution.options"));
  check("with it off the underline is gone at once", (await t.underlined()).length === 0);
  await t.shot("underlines-off");
  // Back to the editor (Esc carries on): the status-line message is still there.
  await t.page.keyboard.press("Escape");
  await t.page.waitForTimeout(300);
  check("...and the status-line message stays", /^doesn't parse yet: /.test(await t.status()), await t.status());
  await t.put(typeCode);
  await t.waitStatus(/^doesn't type-check yet: /, 60000);
  check("with the option off a new error has no underline but keeps the status message", (await t.underlined()).length === 0);
  // Unknown fields in the options object survive a save.
  await t.page.evaluate(() => localStorage.setItem("type-solution.options", '{"underlines":false,"future":{"a":1}}'));
  await t.page.keyboard.press("Escape");
  await t.page.waitForTimeout(200);
  await t.page.locator(".menu .option input").check();
  check("saving keeps fields it does not know", (await t.stored("type-solution.options")) === '{"underlines":true,"future":{"a":1}}', await t.stored("type-solution.options"));
  await t.page.keyboard.press("Escape");
  await t.page.waitForTimeout(200);

  // Switch Language and back: each draft stays; JavaScript always works.
  await t.page.locator(".cm-content").click();
  await t.page.keyboard.press("Alt+KeyL");
  await t.page.waitForTimeout(300);
  check("Alt+L cycles to JavaScript, an empty draft", !(await t.signature()).includes("::") && (await t.text()).trim() === "", JSON.stringify([await t.signature(), await t.text(), await t.status()]));
  check("the PureScript error's underline did not follow into JavaScript", (await t.underlined()).length === 0);
  await t.page.keyboard.press("Alt+KeyL");
  await t.page.waitForTimeout(200);
  check("...and back: the PureScript draft is there", squash(await t.text()) === squash(typeCode), JSON.stringify(await t.text()));
  await t.context.close();
}

// ============ 4. Reload with PureScript remembered; compiler served from Cache Storage ============
if (section(4)) {
  const t = await newPage();
  await t.open();
  await t.select().selectOption({ label: "PureScript" });
  await t.cached(); // the download has finished
  await t.page.reload();
  await t.page.waitForSelector(".cm-content");
  knobs.requests = [];
  await t.page.reload();
  await t.page.waitForSelector(".cm-content");
  await t.page.waitForTimeout(2500);
  const selected = await t.select().evaluate((s) => s.selectedOptions[0].textContent);
  check("a reload opens in the remembered PureScript", selected === "PureScript");
  // The compiler and the manifest come from Cache Storage: only the pointer is asked for, plus (ticket 38) the
  // warm-up's library packs, which this page never fetched before (it was only picked, no check made).
  const reloadPurs = knobs.requests.filter((p) => p.includes("/purs/"));
  check("...from Cache Storage: the pointer, and no compiler or manifest request", reloadPurs.includes(BASE + "purs/current.json") && !reloadPurs.some((p) => /purs-core|manifest|names/.test(p)), JSON.stringify(reloadPurs.map((p) => p.split("/").pop())));
  check("...and the only others are the warm-up's library packs", reloadPurs.every((p) => p.endsWith("/current.json") || p.endsWith(".pack.gz")), "");
  const puzzle = await t.reference();
  await t.put(puzzle.reference);
  const done = await t.waitStatus(/^Passed in /, 60000);
  check("...and a Reference Solution passes", /^Passed in /.test(done), done);
  await t.context.close();
}

// ============ 5. A failed download says so, retries, and the check runs when it works ============
if (section(5)) {
  const t = await newPage();
  knobs.failCompiler = 1;
  await t.open();
  await t.select().selectOption({ label: "PureScript" });
  const failed = await t.waitStatus(/^Could not load the PureScript compiler/, 20000);
  check("a failed download says so", /^Could not load the PureScript compiler/.test(failed), failed);
  check("...with a Retry button", await t.page.locator(".status .retry").isVisible());
  await t.shot("failed");
  const puzzle = await t.reference();
  await t.put(puzzle.reference);
  // JavaScript always works while PureScript is broken.
  await t.page.keyboard.press("Alt+KeyL");
  await t.page.waitForTimeout(200);
  await t.put("function f() { return 1 }");
  await t.page.waitForTimeout(1000);
  check("switching to JavaScript works with PureScript failed", !/PureScript/.test(await t.status()), await t.status());
  await t.page.keyboard.press("Alt+KeyL"); // back; the pick tries the download again
  await t.page.waitForTimeout(100);
  await t.page.locator(".status .retry").click().catch(() => {});
  const done = await t.waitStatus(/^Passed in /, 60000);
  check("Retry (or the next pick) loads it and the waiting check runs", /^Passed in /.test(done), done);
  await t.context.close();
}

// ============ 6. The warm-up: libraries preloaded, nothing shown ============
if (section(6)) {
  const manifestFile = readdirSync(join(site, "purs")).find((n) => /^manifest\..*\.json$/.test(n));
  const manifest = JSON.parse(readFileSync(join(site, "purs", manifestFile), "utf8"));
  const packOf = (lib) => BASE + "purs/" + manifest.parts[lib].file;
  const wanted = (puzzle) => librariesFor(manifest, ["Prelude", ...importedModules(puzzle.reference)]);
  const packsRequested = () => new Set(knobs.requests.filter((p) => p.endsWith(".pack.gz")));

  // At load, PureScript remembered: the Puzzle's libraries come with no typing at all.
  const t = await newPage();
  await t.context.addInitScript(() => localStorage.setItem("type-solution.language", "purescript"));
  knobs.requests = [];
  await t.open();
  const puzzle = await t.reference();
  const need = wanted(puzzle).filter((l) => l !== undefined);
  let got = false;
  for (let i = 0; i < 100 && !got; i++) { got = need.every((l) => packsRequested().has(packOf(l))); if (!got) await t.page.waitForTimeout(100); }
  check("at load, the libraries the Reference Solution imports are fetched with no typing", got, JSON.stringify({ need, got: [...packsRequested()].map((p) => p.split("/").pop().split(".")[0]) }));
  await t.page.waitForTimeout(1500);
  check("...nothing is shown of it: the editor is empty, the status line is still the Run's own", (await t.text()).trim() === "" && /^Start typing/.test(await t.status()), JSON.stringify([await t.text(), await t.status()]));
  check("...and the Run has not started (no clock)", !(await t.page.locator(".menu").isVisible()), "");
  const noPeek = await t.page.evaluate(() => localStorage.getItem("type-solution.runs"));
  check("...no Run record, nothing stored", noPeek === null, String(noPeek));

  // A new Puzzle: the libraries of each Reference Solution that opens are fetched too, before any typing.
  let fetchedNew = 0;
  for (let i = 0; i < 60; i++) {
    const before = packsRequested(); // what had been requested before this Puzzle opened
    await t.page.evaluate(() => document.querySelector('button[title="New random Puzzle"]').click());
    await t.page.waitForTimeout(120);
    const p = await t.reference();
    const missing = wanted(p).filter((l) => !before.has(packOf(l)));
    if (missing.length > 0) {
      let ok = false;
      for (let k = 0; k < 100 && !ok; k++) { ok = missing.every((l) => packsRequested().has(packOf(l))); if (!ok) await t.page.waitForTimeout(100); }
      check(`a new Puzzle (${p.id}) fetches its libraries (${missing.join(", ")}) with no typing`, ok, "");
      fetchedNew++;
      if (fetchedNew >= 2) break;
    }
  }
  check("...at least one new Puzzle needed a library not yet fetched, and got it", fetchedNew >= 1, String(fetchedNew));
  await t.context.close();

  // Switching to PureScript from JavaScript after load: the warm-up follows the compiler's load.
  const u = await newPage();
  knobs.requests = [];
  await u.open();
  await u.page.waitForTimeout(500);
  check("first, JavaScript: no pack requests", packsRequested().size === 0);
  await u.select().selectOption({ label: "PureScript" });
  const p2 = await u.reference();
  let got2 = false;
  for (let i = 0; i < 200 && !got2; i++) { got2 = wanted(p2).every((l) => packsRequested().has(packOf(l))); if (!got2) await u.page.waitForTimeout(100); }
  check("picking PureScript: once the compiler is loaded its Puzzle's libraries are fetched with no typing", got2, "");
  check("...the status line is not the warm-up's: no error, no text", /^Start typing|^$/.test(await u.status()), await u.status());
  await u.context.close();
}

await browser.close();
server.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);

