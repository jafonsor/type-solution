// PureScript's download: the bundle (static/bundle/bundle.mjs) opened, the
// compiler fetched and compiled, kept for the life of the page. One loader per
// page. The Language's `bundle.start` (when the download begins is
// static/bundle/trigger.mjs's) and the Checker (which waits for it) share it.
//
//   start({onProgress})  begins the download if it has not begun (or failed
//                        last time); resolves when the compiler is ready.
//                        onProgress(percent) while the compiler comes in.
//   ready()              resolves once the compiler is ready, whenever that
//                        is, even after a failed download that a retry fixes:
//                        a check waits here and runs when loading finishes.
//   module, manifest     the compiled compiler and the manifest, once ready
//   packs(libraries)     the decoded packs of the libraries and what they need
//   names()              the name table's bytes (the import popup), alone: it
//                        does not wait for the compiler
export function createLoader({ createBundle, compile = (bytes) => WebAssembly.compile(bytes), entry = "purs/current.json", base, cacheName = "purs-bundle", fetch: fetcher, caches: store }) {
  let bundle = null;
  let loading = null; // promise of the attempt in flight, or of the one that succeeded
  let module = null;
  let manifest = null;
  const waiters = [];
  const listeners = new Set();

  const progress = ({ file, loaded, total }) => {
    // The compiler is nearly all of it (23.5 of 23.6 MB); the percentage is its.
    if (manifest?.core.compiler.file !== file || !total) return;
    const percent = Math.min(100, Math.floor((100 * loaded) / total));
    for (const l of listeners) l(percent);
  };

  const get = () => (bundle ??= createBundle({
    fetch: (...a) => (fetcher ?? globalThis.fetch)(...a), caches: store ?? globalThis.caches, entry, base, cacheName, onProgress: progress,
  }));

  async function load() {
    const b = get();
    manifest = await b.open();
    const bytes = await b.core("compiler");
    module = await compile(bytes);
    for (const w of waiters.splice(0)) w();
  }

  const self = {
    get module() { return module; },
    get manifest() { return manifest; },
    get loaded() { return module !== null; },
    get bundle() { return get(); },
    start({ onProgress } = {}) {
      if (onProgress) listeners.add(onProgress);
      if (module) return Promise.resolve();
      loading ??= load().catch((err) => { loading = null; manifest = null; throw err; });
      return loading;
    },
    ready() {
      if (module) return Promise.resolve();
      if (!loading) self.start().catch(() => {}); // a check before anyone asked: ask now
      return new Promise((resolve) => waiters.push(resolve));
    },
    packs: (libraries) => get().partsWithRequirements(libraries),
    names: () => get().core("names"),
  };
  return self;
}
