import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args:["--allow-file-access-from-files"] });
for (const wait of [0, 30, 60, 90, 120, 200, 400]) {
  const p = await b.newPage();
  await p.goto("file://" + process.cwd() + "/index.html");
  await p.waitForSelector(".cm-content"); await p.click(".cm-content");
  await p.keyboard.type("f = ta", {delay:20});
  await new Promise(r=>setTimeout(r,wait));
  await p.keyboard.press("Tab");
  await new Promise(r=>setTimeout(r,50));
  const d = await p.evaluate(()=>window.snap().doc);
  console.log(String(wait).padStart(4), "ms after last letter ->", d.startsWith("import") ? "ACCEPTED" : "indented/other", JSON.stringify(d));
  await p.close();
}
await b.close();
