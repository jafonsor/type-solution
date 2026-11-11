import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args:["--allow-file-access-from-files"] });
const p = await b.newPage();
p.on("pageerror", e => console.log("PAGEERR", e.message));
await p.goto("file://" + process.cwd() + "/index.html");
await p.waitForSelector(".cm-content");
const st = () => p.evaluate(() => window.snap());
const log = async (l) => console.log(l.padEnd(34), JSON.stringify(await st()));
await p.click(".cm-content");
const type = async s => { for (const c of s) await p.keyboard.type(c, {delay:15}); await new Promise(r=>setTimeout(r,120)); };
const key = async (k, mod) => { if (mod) await p.keyboard.down(mod); await p.keyboard.press(k); if (mod) await p.keyboard.up(mod); await new Promise(r=>setTimeout(r,120)); };

await type("f = ta"); await log("typed 'f = ta'");
console.log("popup items:", await p.$$eval(".cm-tooltip-autocomplete li", l => l.map(x=>x.textContent)));
await key("Tab"); await log("Tab (accept)");
await type("ke"); await log("typed 'ke'");
await key("ArrowRight"); // nothing
await type(" xs\n"); await log("newline");
await type("dr"); await log("typed 'dr'");
console.log("popup items:", await p.$$eval(".cm-tooltip-autocomplete li", l => l.map(x=>x.textContent)));
await key("Enter"); await log("Enter (accept, merge)");
await type("op xs"); await log("typed 'op xs'");
await key("Tab"); await log("Tab, no popup (indent)");
await key("z","Meta"); await log("undo 1");
await key("z","Meta"); await log("undo 2");
await key("z","Meta"); await log("undo 3");
await key("z","Meta"); await log("undo 4");
await b.close();
