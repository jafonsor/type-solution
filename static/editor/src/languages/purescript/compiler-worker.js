// The compiler worker: one per page, kept between checks (see check.mjs), a thin
// adapter from messages to compiler.mjs. Built by esbuild into one script
// (static/default.nix: js/purs-compiler.js).
//
//   in:  {type: "init", module, sourceMtime}   the compiled purs-core.wasm
//        {type: "check", id, source, harness, imports, packs}
//        packs: the decoded packs the worker does not hold yet
//        {type: "preload", packs}   the same packs, with no compile (the warm-up)
//   out: {type: "result", id, exit, text, ms, sourceFiles, modules?}
//        {type: "preloaded", names}  the preload's libraries are in the tree
import { createCompiler } from "./compiler.mjs";

let compiler = null;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    compiler = createCompiler({ module: m.module, sourceMtime: m.sourceMtime });
    return;
  }
  if (m.type === "preload") {
    try {
      compiler.add(m.packs);
      postMessage({ type: "preloaded", names: m.packs.map((p) => p.header.name) });
    } catch { /* silent: the next check brings the libraries again */ }
    return;
  }
  if (m.type === "check") {
    try {
      compiler.add(m.packs);
      const r = await compiler.compile({ source: m.source, harness: m.harness, imports: m.imports });
      postMessage({ type: "result", id: m.id, ...r });
    } catch (err) {
      postMessage({ type: "result", id: m.id, exit: 1, text: `the compiler worker failed: ${(err && err.stack) || err}` });
    }
  }
};
