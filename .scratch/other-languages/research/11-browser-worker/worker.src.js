import { WASI, File as F0, Directory, PreopenDirectory, ConsoleStdout, OpenFile, wasi as wdefs } from '@bjorn3/browser_wasi_shim';
let clock = 1700000000000000000n;
class File extends F0 { constructor(d){ super(d); this.m = clock; } stat(){ const s = super.stat(); s.mtim = this.m; s.atim = this.m; s.ctim = this.m; return s; } }
const bump = () => { clock += 1000000000n; };
const post = (m) => postMessage(m);
const ms = (t) => Math.round(performance.now() - t);
onmessage = async () => {
  const R = {};
  try {
    let t = performance.now();
    const wasmResp = await fetch('purs-core.wasm');
    const wasmBytes = await wasmResp.arrayBuffer();
    R.fetch_wasm_ms = ms(t); R.wasm_bytes = wasmBytes.byteLength;
    t = performance.now();
    const mod = await WebAssembly.compile(wasmBytes);
    R.wasm_compile_ms = ms(t);
    t = performance.now();
    const manifest = (await (await fetch('manifest.txt')).text()).split('\n').filter(Boolean);
    const files = await Promise.all(manifest.map(async p => [p, new Uint8Array(await (await fetch('w/' + p)).arrayBuffer())]));
    R.fetch_files_ms = ms(t); R.files = files.length; R.files_bytes = files.reduce((a, [, b]) => a + b.length, 0);
    // build in-memory tree
    const root = new Map();
    const put = (p, bytes) => { const parts = p.split('/'); let d = root; for (const s of parts.slice(0, -1)) { if (!d.has(s)) d.set(s, new Directory(new Map())); d = d.get(s).contents; } d.set(parts.at(-1), new File(bytes)); };
    t = performance.now();
    for (const [p, b] of files) put(p, b);
    R.build_fs_ms = ms(t);
    const srcFiles = manifest.filter(p => p.startsWith('prelude/src/') && p.endsWith('.purs')).map(p => '/w/' + p);
    const mainOrig = new TextDecoder().decode(files.find(([p]) => p === 'src/Main.purs')[1]);
    const getDir = (p) => p.split('/').reduce((d, s) => d.contents.get(s), { contents: root });
    const setMain = (txt) => { bump(); getDir('src').contents.set('Main.purs', new File(new TextEncoder().encode(txt))); };
    const runOnce = async (label) => {
      let out = [];
      const cap = ConsoleStdout.lineBuffered(l => out.push(l));
      const pre = new PreopenDirectory('/w', root);
      const wasi = new WASI(['purs-core', '/w/out', ...srcFiles, '/w/src/Main.purs'], [], [new OpenFile(new File([])), cap, cap, pre]);
      const t0 = performance.now();
      const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
      const t1 = performance.now();
      let code;
      try { code = wasi.start(inst); } catch (e) { code = 'throw ' + e; }
      const t2 = performance.now();
      R[label] = { instantiate_ms: Math.round(t1 - t0), run_ms: Math.round(t2 - t1), exit: code, mem_mb: Math.round(inst.exports.memory.buffer.byteLength / 1e6), tail: out.slice(-4), full: label.includes('error') ? out.join('\n') : undefined };
    };
    // Root passed to PreopenDirectory shares `root` map, so writes persist across runs.
    await runOnce('run1_cold_externs_cached_as_shipped');
    await runOnce('run2_unchanged');
    setMain(mainOrig + '\n\nextra :: Int -> Int\nextra x = x * 2\n');
    await runOnce('run3_main_edited');
    setMain(mainOrig + '\n\nbad :: Int\nbad = "oops"\n');
    await runOnce('run4_type_error');
    setMain(mainOrig + '\n\nbad :: Int\nbad = (\n');
    await runOnce('run5_syntax_error');
    setMain(mainOrig);
    await runOnce('run6_back_to_good');
    // cold: remove all cached externs
    root.delete('out'); root.set('out', new Directory(new Map()));
    await runOnce('run7_cold_no_cache_prelude_from_source');
    // run the generated JS: link ESM files via blob URLs (index.js per module; foreign.js)
    const outDir = getDir('out');
    const dec = (f) => new TextDecoder().decode(f.data);
    const mods = {}; for (const [n, d] of outDir.contents) if (d.contents && d.contents.has('index.js')) mods[n] = { src: dec(d.contents.get('index.js')), foreign: d.contents.has('foreign.js') ? dec(d.contents.get('foreign.js')) : null };
    R.js_modules = Object.keys(mods).length;
    const urls = {};
    const link = (n) => { if (urls[n]) return urls[n]; const m = mods[n]; let src = m.src;
      if (m.foreign) { urls[n + '/foreign'] = URL.createObjectURL(new Blob([m.foreign], { type: 'text/javascript' })); src = src.replace(/\.\/foreign\.js/g, urls[n + '/foreign']); }
      src = src.replace(/from "\.\.\/([^"/]+)\/index\.js"/g, (_, d) => 'from "' + link(d) + '"');
      return urls[n] = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); };
    try { const t = performance.now(); const M = await import(/* @vite-ignore */ link('Main')); R.js_link_import_ms = ms(t); R.js_exports = Object.keys(M).slice(0, 20); R.js_older = JSON.stringify(M.older({ name: 'a', age: 1 })); R.js_describe = M.compose3 ? 'ok' : 'n/a'; } catch (e) { R.js_exec_err = String(e); }
    // read generated JS
    const js = new TextDecoder().decode(getDir('out/Main').contents.get('index.js').data);
    R.main_js_bytes = js.length;
    R.main_js_head = js.slice(0, 200);
    post({ ok: true, R });
  } catch (e) { post({ ok: false, err: String(e && e.stack || e), R }); }
};
