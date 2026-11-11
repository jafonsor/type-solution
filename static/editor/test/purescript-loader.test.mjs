// PureScript's download: one loader, the compiler compiled once, the name table
// alone, progress, failure and retry. Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "../src/languages/purescript/loader.mjs";

const flush = () => new Promise((r) => setImmediate(r));
const manifest = { sourceMtime: "2000-01-01T00:00:00Z", core: { compiler: { file: "purs-core.abc.wasm", bytes: 200 }, names: { file: "names.abc.json", bytes: 3 } }, parts: {}, modules: {} };

// A fake createBundle: `fails` makes open() throw that many times.
function fake({ fails = 0 } = {}) {
  const calls = { open: 0, core: [], packs: [] };
  let progress;
  let remaining = fails;
  const create = (options) => {
    progress = options.onProgress;
    calls.options = options;
    return {
      async open() { calls.open++; if (remaining-- > 0) throw new Error("offline"); return manifest; },
      async core(name) {
        calls.core.push(name);
        if (name === "compiler") { progress({ file: "purs-core.abc.wasm", loaded: 50, total: 200 }); progress({ file: "purs-core.abc.wasm", loaded: 200, total: 200 }); }
        return new Uint8Array([1, 2, 3]);
      },
      async partsWithRequirements(libs) { calls.packs.push(libs); return libs.map((name) => ({ header: { name } })); },
    };
  };
  return { create, calls };
}

test("start opens the bundle, fetches the compiler and compiles it once; asking again shares the work", async () => {
  const f = fake();
  const compiled = [];
  const loader = createLoader({ createBundle: f.create, compile: async (b) => { compiled.push(b); return "MODULE"; } });
  assert.equal(loader.loaded, false);
  await Promise.all([loader.start(), loader.start()]);
  await loader.start();
  assert.equal(loader.loaded, true);
  assert.equal(loader.module, "MODULE");
  assert.equal(loader.manifest, manifest);
  assert.equal(compiled.length, 1);
  assert.equal(f.calls.open, 1);
  assert.deepEqual(f.calls.core, ["compiler"], "the name table is the popup's, asked for on its own");
});

test("progress is the compiler's percentage", async () => {
  const f = fake();
  const seen = [];
  const loader = createLoader({ createBundle: f.create, compile: async () => "M" });
  await loader.start({ onProgress: (p) => seen.push(p) });
  assert.deepEqual(seen, [25, 100]);
  // another file's progress is not the compiler's
  f.calls.options.onProgress({ file: "names.abc.json", loaded: 3, total: 3 });
  assert.deepEqual(seen, [25, 100]);
});

test("the name table does not wait for the compiler", async () => {
  const f = fake();
  const loader = createLoader({ createBundle: f.create, compile: () => new Promise(() => {}) });
  loader.start();
  const names = await loader.names();
  assert.deepEqual([...names], [1, 2, 3]);
  assert.equal(loader.loaded, false, "the compiler is still loading");
});

test("a failed download is not remembered: start again retries, and a check that waited runs when it succeeds", async () => {
  const f = fake({ fails: 1 });
  const loader = createLoader({ createBundle: f.create, compile: async () => "M" });
  let ready = false;
  const waiting = loader.ready().then(() => { ready = true; });
  await assert.rejects(loader.start(), /offline/);
  await flush();
  assert.equal(ready, false, "the check keeps waiting through a failed download");
  await loader.start(); // the retry
  await waiting;
  assert.equal(ready, true);
  assert.equal(loader.loaded, true);
});

test("ready() before anyone started the download starts it", async () => {
  const f = fake();
  const loader = createLoader({ createBundle: f.create, compile: async () => "M" });
  await loader.ready();
  assert.equal(loader.loaded, true);
});

test("packs asks the bundle for the libraries and what they need", async () => {
  const f = fake();
  const loader = createLoader({ createBundle: f.create, compile: async () => "M" });
  assert.deepEqual((await loader.packs(["arrays"])).map((p) => p.header.name), ["arrays"]);
  assert.deepEqual(f.calls.packs, [["arrays"]]);
});

test("the bundle is addressed by the entry, relative to the page's base, cached under its own name", async () => {
  const f = fake();
  const loader = createLoader({ createBundle: f.create, compile: async () => "M", entry: "purs/current.json", base: "https://x.test/type-solution/", cacheName: "purs-bundle" });
  await loader.start();
  assert.equal(f.calls.options.entry, "purs/current.json");
  assert.equal(f.calls.options.base, "https://x.test/type-solution/");
  assert.equal(f.calls.options.cacheName, "purs-bundle");
});
