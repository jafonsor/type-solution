// MEASUREMENT ONLY: a compiler worker just big enough to time the bundle in a
// browser (fetch, assemble the tree, compile). The real Checker worker is
// ticket 31's. Follows research/11-browser-worker/worker.src.js.
import { WASI, File as F0, Directory, PreopenDirectory, ConsoleStdout, OpenFile } from "@bjorn3/browser_wasi_shim";
import { createBundle } from "../../../static/bundle/bundle.mjs";
import { assembleTree, importedModules, librariesFor, sourcesFor } from "../../../static/bundle/purs-tree.mjs";

const ms = (t) => Math.round(performance.now() - t);
let mtime = 0n;
class File extends F0 {
  constructor(d, m) { super(d); this.m = m; }
  stat() { const s = super.stat(); s.mtim = s.atim = s.ctim = this.m; return s; }
}
const toNs = (iso) => BigInt(Date.parse(iso)) * 1000000n;

onmessage = async (e) => {
  const R = {};
  try {
    let t = performance.now();
    const bundle = createBundle({ fetch: (...a) => fetch(...a), caches, entry: "purs/current.json", cacheName: "purs-bundle" });
    const manifest = await bundle.open();
    R.open_ms = ms(t);
    t = performance.now();
    const wasm = await bundle.core("compiler");
    R.compiler_bytes = wasm.length; R.compiler_fetch_ms = ms(t);
    t = performance.now();
    const mod = await WebAssembly.compile(wasm);
    R.wasm_compile_ms = ms(t);

    const code = e.data.code;
    const libs = librariesFor(manifest, importedModules(code));
    R.libraries = libs; R.libraries_gz_bytes = libs.reduce((n, l) => n + manifest.parts[l].bytes, 0);
    t = performance.now();
    const packs = await bundle.partsWithRequirements(libs);
    R.packs_fetch_ms = ms(t);
    t = performance.now();
    const tree = assembleTree(packs, manifest.sourceMtime);
    const libNs = toNs(manifest.sourceMtime);
    const root = new Map();
    for (const [p, b] of tree.files) {
      const parts = p.split("/"); let d = root;
      for (const s of parts.slice(0, -1)) { if (!d.has(s)) d.set(s, new Directory(new Map())); d = d.get(s).contents; }
      d.set(parts.at(-1), new File(b, libNs));
    }
    root.set("src", new Directory(new Map()));
    R.tree_ms = ms(t); R.tree_files = tree.files.size; R.tree_raw_bytes = [...tree.files.values()].reduce((n, b) => n + b.length, 0);

    const srcFiles = e.data.all ? tree.srcFiles : sourcesFor(packs, importedModules(code));
    R.source_files_given = srcFiles.length; R.source_files_in_tree = tree.srcFiles.length;
    mtime = libNs + 1000000000000n;
    const setMain = (txt) => { mtime += 1000000000n; root.get("src").contents.set("Main.purs", new File(new TextEncoder().encode(txt), mtime)); };
    const compile = async (label, txt) => {
      setMain(txt);
      const out = [];
      const cap = ConsoleStdout.lineBuffered((l) => out.push(l));
      const wasi = new WASI(["purs-core", "/w/out", ...srcFiles, "/w/src/Main.purs"], [], [new OpenFile(new File([], 0n)), cap, cap, new PreopenDirectory("/w", root)]);
      const t0 = performance.now();
      const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
      const t1 = performance.now();
      let exit;
      try { exit = wasi.start(inst); } catch (err) { exit = "throw " + err; }
      const t2 = performance.now();
      R[label] = { instantiate_ms: Math.round(t1 - t0), run_ms: Math.round(t2 - t1), exit, mem_mb: Math.round(inst.exports.memory.buffer.byteLength / 1e6), compiled_modules: out.filter((l) => /Compiling/.test(l)).length, tail: out.slice(-3).join(" | ").slice(0, 200) };
    };
    await compile("check1_first", code);
    await compile("check2_unchanged", code);
    await compile("check3_edited", code + "\n-- edit\n");
    postMessage({ ok: true, R });
  } catch (err) { postMessage({ ok: false, err: String((err && err.stack) || err) }); }
};
