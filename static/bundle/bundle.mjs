// The lazy-loaded bundle of a Language, kept in Cache Storage. Language-agnostic:
// the Language's build writes a manifest (see tools/purs-bundle/build.mjs for
// PureScript's) and this module fetches and caches what it names.
//
//   current.json            {"manifest": "manifest.<hash>.json"}, the one file
//                           with a fixed name; always revalidated
//   manifest.<hash>.json    {core: {<name>: {file, bytes}}, parts: {<name>:
//                           {file, bytes, rawBytes, requires: [part names]}}, ...}
//   every other file        has a content hash in its name, so it can be cached
//                           for ever (GitHub Pages sets only max-age=600)
//
// Opening the bundle fetches the pointer and the manifest only. A `core` file
// (the compiler, the name table) is fetched when something asks for it by name
// (`core(name)`), alone: asking for the small name table never waits for the
// compiler. A part (a library) is fetched only when something asks for it.
// Two asks for one file share one download. Cache Storage holds the files
// of ONE manifest: opening a manifest the cache does not hold deletes every
// cached file the new manifest does not name (files that kept their hash stay,
// so a new library version does not re-download the compiler).
//
// `fetch` and `caches` are the browser's, passed in so tests can fake them.
import { readPack } from "./pack.mjs";

export function createBundle({ fetch, caches, entry, cacheName = "bundle", base = globalThis.location?.href ?? "http://localhost/", onProgress = () => {} }) {
  // Everything is addressed by absolute URL (Cache Storage keys are).
  const entryUrl = new URL(entry, base).href;
  const resolve = (file) => new URL(file, entryUrl).href;
  let cache = null;
  let manifest = null;
  let opening = null;
  const parts = new Map(); // name -> promise of decoded pack
  const downloads = new Map(); // url -> promise of the bytes, while it is being fetched

  const getCache = async () => (cache ??= await caches.open(cacheName));

  // The bytes of a hashed file: from the cache, else the network (stored).
  // Progress is reported in decoded bytes against the manifest's size.
  function file(name, size) {
    const key = resolve(name);
    if (!downloads.has(key)) {
      const pending = fetchFile(name, size, key).finally(() => downloads.delete(key));
      downloads.set(key, pending);
    }
    return downloads.get(key);
  }

  async function fetchFile(name, size, key) {
    const c = await getCache();
    const hit = await c.match(key);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
    const res = await fetch(key);
    if (!res.ok) throw new Error(`could not fetch ${name} (${res.status})`);
    const bytes = await readBody(res, (n) => onProgress({ file: name, loaded: n, total: size }));
    await c.put(key, new Response(bytes, { headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" } }));
    return bytes;
  }

  async function readBody(res, progress) {
    if (!res.body) return new Uint8Array(await res.arrayBuffer());
    const chunks = [];
    let n = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      n += value.length;
      progress(n);
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const ch of chunks) { out.set(ch, at); at += ch.length; }
    return out;
  }

  // Deletes every cached file the manifest does not name.
  async function prune(m, manifestFile) {
    const c = await getCache();
    const keep = new Set([manifestFile, ...Object.values(m.core).map((f) => f.file), ...Object.values(m.parts).map((p) => p.file)].map(resolve));
    for (const req of await c.keys()) if (!keep.has(req.url)) await c.delete(req);
  }

  async function doOpen() {
    const c = await getCache();
    let manifestFile = null;
    try {
      const res = await fetch(entryUrl, { cache: "no-cache" });
      if (!res.ok) throw new Error(`could not fetch ${entryUrl} (${res.status})`);
      manifestFile = (await res.json()).manifest;
    } catch (err) {
      // Offline: the manifest we stored last time, if any.
      const stored = (await c.keys()).map((r) => r.url).filter((u) => /\/manifest\.[^/]*\.json$/.test(u));
      if (stored.length === 0) throw err;
      manifestFile = stored[0].replace(/^.*\//, "");
    }
    const bytes = await file(manifestFile, 0);
    manifest = JSON.parse(new TextDecoder().decode(bytes));
    await prune(manifest, manifestFile);
    return manifest;
  }

  return {
    // Fetches (or finds in the cache) the manifest; deletes the cached files
    // it does not name (old versions). Idempotent; a failure is not remembered, so call again to retry.
    open() {
      opening ??= doOpen().catch((err) => { opening = null; throw err; });
      return opening;
    },
    get manifest() { return manifest; },
    // A core file's bytes (the compiler's wasm, the name table): this file
    // only. Callers asking at once share the bytes: do not modify or transfer them.
    async core(name) {
      const m = await this.open();
      if (!m.core[name]) throw new Error(`no core file named ${name} in the bundle`);
      return file(m.core[name].file, m.core[name].bytes);
    },
    // A part, decoded (see pack.mjs). Fetched on first use only.
    async part(name) {
      const m = await this.open();
      const p = m.parts[name];
      if (!p) throw new Error(`no part named ${name} in the bundle`);
      if (!parts.has(name)) {
        const pending = file(p.file, p.bytes).then(readPack);
        parts.set(name, pending);
        pending.catch(() => parts.delete(name));
      }
      return parts.get(name);
    },
    // A part and the parts it requires.
    async partsWithRequirements(names) {
      const m = await this.open();
      const all = new Set();
      for (const n of names) { all.add(n); for (const r of m.parts[n]?.requires ?? []) all.add(r); }
      return Promise.all([...all].sort().map((n) => this.part(n)));
    },
  };
}
