// A measurement page for the lazy bundle (not the app): the real trigger and
// loader, wired to two fake Languages, in a real browser. The driver
// (drive.mjs) loads it with a remembered Language, picks Languages and counts
// the requests the server sees.
import { createBundle } from "./static/bundle/bundle.mjs";
import { createBundleTrigger } from "./static/bundle/trigger.mjs";

const languages = [{ name: "javascript" }, { name: "purescript", bundle: { entry: "purs/current.json" } }];
const bundles = new Map();
const trigger = createBundleTrigger({
  languages,
  // What ticket 31 will do: open the bundle (manifest + compiler).
  start: async (name) => {
    const language = languages.find((l) => l.name === name);
    const bundle = createBundle({ fetch: (...a) => fetch(...a), caches, entry: language.bundle.entry, cacheName: "purs-bundle" });
    bundles.set(name, bundle);
    await bundle.core("compiler");
    return bundle;
  },
});

// The remembered Language, as the app will keep it.
const remembered = new URLSearchParams(location.search).get("remembered") ?? "javascript";
window.harness = {
  pick: (name) => trigger.onPick(name)?.then(() => "ok") ?? null,
  status: (name) => trigger.status(name),
  bundle: (name) => bundles.get(name),
  async cacheKeys() {
    const c = await caches.open("purs-bundle");
    return (await c.keys()).map((r) => r.url.replace(location.origin + "/", ""));
  },
  compile(code) {
    return new Promise((resolve, reject) => {
      const w = new Worker("worker.js");
      w.onmessage = (e) => (w.terminate(), e.data.ok ? resolve(e.data.R) : reject(new Error(e.data.err)));
      w.postMessage({ code });
    });
  },
};
trigger.onPageLoad(remembered);
window.loaded = true;
