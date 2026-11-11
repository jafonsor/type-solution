// The compiler, in-process: the released purs-core.wasm run through a WASI
// shim over an in-memory file tree. Everything the browser worker
// (compiler-worker.js) does is here, so Node can test it with the real compiler.
//
// One Compiler lives as long as its worker. It keeps the file tree between
// checks (the libraries' packs, and the compiler's own output for the
// Solution, so an unchanged check is fast); every check runs a fresh instance
// of the wasm module (the compiler is one-shot: it exits when done).
//
// The tree and the modified-time rule are static/bundle/purs-tree.mjs's: every
// file from a pack reports the manifest's `sourceMtime`, and Main.purs (and
// Harness.purs) a later one that moves on with every check, else the compiler
// rebuilds the libraries (measured: 3 s for Prelude, 79 s for `arrays`).
import { WASI, File as ShimFile, Directory, PreopenDirectory, ConsoleStdout, OpenFile } from "@bjorn3/browser_wasi_shim";
import { assembleTree, sourcesFor } from "../../../../bundle/purs-tree.mjs";

// A file that reports the modified time we choose.
class File extends ShimFile {
  constructor(data, mtime) { super(data); this.mtime = mtime; }
  stat() { const s = super.stat(); s.mtim = s.atim = s.ctim = this.mtime; return s; }
}

const NS_PER_MS = 1000000n;
const SECOND = 1000000000n;
const toNs = (iso) => BigInt(Date.parse(iso)) * NS_PER_MS;

function directoryAt(root, path) {
  let d = { contents: root };
  for (const part of path.split("/")) {
    d = d.contents.get(part);
    if (!d) return null;
  }
  return d;
}

// `module` is a compiled WebAssembly.Module of purs-core.wasm.
export function createCompiler({ module, sourceMtime }) {
  const libNs = toNs(sourceMtime);
  let clock = libNs + 1000n * SECOND; // later than every library file
  const loaded = new Map(); // library name -> decoded pack
  let tree = null;          // {root, srcFiles}, rebuilt when the set of libraries changes

  function build() {
    const packs = [...loaded.values()];
    const { files, srcFiles } = assembleTree(packs, sourceMtime);
    const root = new Map();
    for (const [path, bytes] of files) {
      const parts = path.split("/");
      let d = root;
      for (const s of parts.slice(0, -1)) {
        if (!d.has(s)) d.set(s, new Directory(new Map()));
        d = d.get(s).contents;
      }
      d.set(parts.at(-1), new File(bytes, libNs));
    }
    root.set("src", new Directory(new Map()));
    tree = { root, srcFiles, packs };
  }

  const put = (name, text) => {
    clock += SECOND;
    directoryAt(tree.root, "src").contents.set(name, new File(new TextEncoder().encode(text), clock));
  };

  // The generated JavaScript of `entry` and every module it reaches, for the sandbox.
  function linkable(entry) {
    const out = {};
    const text = (path) => {
      const f = directoryAt(tree.root, path);
      return f ? new TextDecoder().decode(f.data) : null;
    };
    const visit = (name) => {
      if (out[name]) return;
      const src = text(`out/${name}/index.js`);
      if (src === null) return;
      out[name] = { src, foreign: text(`out/${name}/foreign.js`) };
      for (const m of src.matchAll(/from "\.\.\/([^"/]+)\/index\.js"/g)) visit(m[1]);
    };
    visit(entry);
    return out;
  }

  return {
    // The libraries held (names).
    has: (name) => loaded.has(name),
    // Add decoded packs ({header, files}, see static/bundle/pack.mjs).
    add(packs) {
      let changed = tree === null;
      for (const p of packs) if (!loaded.has(p.header.name)) { loaded.set(p.header.name, p); changed = true; }
      if (changed) build();
    },
    // Compile `source` (Main.purs) and, if given, `harness` (Harness.purs)
    // against the libraries reachable from `imports`. -> {exit, text, ms,
    // modules}: the compiler's exit code and output; `modules` (on exit 0) is
    // what the sandbox links: {name: {src, foreign}}.
    async compile({ source, harness, imports }) {
      if (tree === null) build();
      put("Main.purs", source);
      const files = ["/w/src/Main.purs"];
      if (harness) { put("Harness.purs", harness); files.push("/w/src/Harness.purs"); }
      else directoryAt(tree.root, "src").contents.delete("Harness.purs");
      const srcFiles = sourcesFor(tree.packs, imports);
      const out = [];
      const sink = ConsoleStdout.lineBuffered((l) => out.push(l));
      const wasi = new WASI(
        ["purs-core", "/w/out", ...srcFiles, ...files],
        [],
        [new OpenFile(new File([], 0n)), sink, sink, new PreopenDirectory("/w", tree.root)],
        // The shim treats an absent `debug` as "on" and logs every system call
        // to the console, which costs time on every file the compiler opens.
        { debug: false },
      );
      const t0 = performance.now();
      const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
      let exit;
      try { exit = wasi.start(instance); } catch (err) { exit = 1; out.push(`the compiler stopped: ${err}`); }
      const result = { exit, text: out.join("\n"), ms: Math.round(performance.now() - t0), sourceFiles: srcFiles.length };
      if (exit === 0) result.modules = linkable(harness ? "Harness" : "Main");
      return result;
    },
  };
}
