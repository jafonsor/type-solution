// The loader against a fake network and a fake Cache Storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { createBundle } from "../bundle.mjs";
import { encodePack, decodePack, readPack } from "../pack.mjs";
import { fakeCaches, fakeFetch } from "./fakes.mjs";

const B = "https://site.test/app/purs/";
const pack = (name) => gzipSync(encodePack({ name, modules: [] }, [{ path: `lib/${name}/x.purs`, bytes: new TextEncoder().encode("module X where") }]));

// A version of the bundle: compiler bytes and libraries a, b, c (b needs a).
function version(tag) {
  const files = new Map();
  const m = { core: { compiler: { file: `core.${tag}.wasm`, bytes: 3 } }, parts: {} };
  files.set(B + m.core.compiler.file, new Uint8Array([1, 2, 3]));
  for (const [n, requires] of [["a", []], ["b", ["a"]], ["c", []]]) {
    const p = pack(n + tag);
    m.parts[n] = { file: `${n}.${tag}.pack.gz`, bytes: p.length, requires };
    files.set(B + m.parts[n].file, p);
  }
  files.set(B + `manifest.${tag}.json`, JSON.stringify(m));
  files.set(B + "current.json", JSON.stringify({ manifest: `manifest.${tag}.json` }));
  return files;
}
const open = (files, caches) => {
  const net = fakeFetch(files);
  return { net, bundle: createBundle({ fetch: net.fetch, caches, entry: B + "current.json", cacheName: "purs" }) };
};

test("opening fetches the pointer (revalidating), the manifest and the compiler, not any library", async () => {
  const { net, bundle } = open(version("v1"), fakeCaches());
  await bundle.open();
  assert.deepEqual(net.log.map((r) => r.url.replace(B, "")), ["current.json", "manifest.v1.json", "core.v1.wasm"]);
  assert.equal(net.log[0].init.cache, "no-cache");
});

test("a library's pack is fetched only when asked for, once, with what it requires", async () => {
  const { net, bundle } = open(version("v1"), fakeCaches());
  await bundle.open();
  const got = await bundle.partsWithRequirements(["b"]);
  assert.deepEqual(got.map((p) => p.header.name), ["av1", "bv1"]);
  assert.ok(net.log.some((r) => r.url.endsWith("a.v1.pack.gz")));
  assert.ok(!net.log.some((r) => r.url.includes("c.v1")), "c was never asked for");
  const before = net.log.length;
  await bundle.part("b");
  await bundle.part("a");
  assert.equal(net.log.length, before, "asked again: no new request");
});

test("everything stored is under a hashed name and the second visit makes no bundle request but the pointer", async () => {
  const caches = fakeCaches();
  const first = open(version("v1"), caches);
  await first.bundle.partsWithRequirements(["b"]);
  const second = open(version("v1"), caches);
  await second.bundle.partsWithRequirements(["b"]);
  assert.deepEqual(second.net.log.map((r) => r.url.replace(B, "")), ["current.json"]);
  assert.deepEqual([...caches.stores.get("purs").keys()].map((u) => u.replace(B, "")).sort(),
    ["a.v1.pack.gz", "b.v1.pack.gz", "core.v1.wasm", "manifest.v1.json"]);
});

test("storing a new version deletes the old one's files, keeps unchanged ones", async () => {
  const caches = fakeCaches();
  await open(version("v1"), caches).bundle.partsWithRequirements(["b", "c"]);
  const v2 = version("v2");
  // The compiler did not change: same file name and bytes in v2.
  const m2 = JSON.parse(v2.get(B + "manifest.v2.json"));
  m2.core.compiler.file = "core.v1.wasm";
  v2.set(B + "manifest.v2.json", JSON.stringify(m2));
  v2.set(B + "core.v1.wasm", new Uint8Array([1, 2, 3]));
  const next = open(v2, caches);
  await next.bundle.open();
  const left = [...caches.stores.get("purs").keys()].map((u) => u.replace(B, "")).sort();
  assert.deepEqual(left, ["core.v1.wasm", "manifest.v2.json"]);
  assert.ok(!next.net.log.some((r) => r.url.endsWith("core.v1.wasm")), "the unchanged compiler was not downloaded again");
  await next.bundle.part("a");
  assert.ok([...caches.stores.get("purs").keys()].some((u) => u.endsWith("a.v2.pack.gz")));
});

test("a failed open is not remembered; offline, the stored manifest is used", async () => {
  const caches = fakeCaches();
  await open(version("v1"), caches).bundle.open();
  const offline = createBundle({ fetch: async () => { throw new TypeError("offline"); }, caches, entry: B + "current.json", cacheName: "purs" });
  const m = await offline.open();
  assert.equal(m.core.compiler.file, "core.v1.wasm");
  const empty = createBundle({ fetch: async () => { throw new TypeError("offline"); }, caches: fakeCaches(), entry: B + "current.json", cacheName: "purs" });
  await assert.rejects(empty.open(), /offline/);
  await assert.rejects(empty.open(), /offline/); // tried again, not a cached failure
});

test("progress is reported in decoded bytes against the manifest size", async () => {
  const seen = [];
  const net = fakeFetch(version("v1"));
  const b = createBundle({ fetch: net.fetch, caches: fakeCaches(), entry: B + "current.json", cacheName: "purs", onProgress: (p) => seen.push(p) });
  await b.core("compiler");
  assert.deepEqual(seen.at(-1), { file: "core.v1.wasm", loaded: 3, total: 3 });
});

test("pack: encode, gzip, read back", async () => {
  const p = await readPack(pack("z"));
  assert.equal(p.header.name, "z");
  assert.equal(new TextDecoder().decode(p.files.get("lib/z/x.purs")), "module X where");
  assert.throws(() => decodePack(new Uint8Array([9, 0, 0, 0, 1])));
});
