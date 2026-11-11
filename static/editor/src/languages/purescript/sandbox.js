// PureScript's test runner, the script a fresh sandbox worker runs (the same
// worker pool and timeout as JavaScript's: static/editor/src/sandbox.mjs).
// Built by esbuild into one classic script (static/default.nix: js/purs-sandbox.js).
//
// Gets:   JSON text {modules, main, fn, tests: [{args, expected}], dicts, typed}
//           modules: {<Module>: {src, foreign}}, the generated JavaScript of
//                    Main and everything it reaches (ES modules);
//           main:    "Main", or "Harness" on the typed path;
//           dicts:   one of "eq" | "other" per constraint, in order (calling.mjs);
//           typed:   the Harness has one function t<i> per test.
// Sends:  JSON text {kind: "results", results: [{pass, got}]} or {kind: "error", message}
// The same protocol, pass rule and result shape as static/src/js/runner.js, and
// the same rule as tools/puzzle-check/purs-test-worker.js (the Node twin).
const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));

// A pass compares results as JSON with object keys sorted (arrays keep their order).
const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys)
  : v !== null && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v;
const same = (got, expected) => {
  const g = show(got);
  return g !== "undefined" && g !== undefined && JSON.stringify(sortKeys(JSON.parse(g))) === JSON.stringify(sortKeys(expected));
};

// A PureScript value as JSON: Tuples become two-item arrays (the compiler
// builds them as objects of a class named Tuple with value0 and value1).
const toJson = (v) =>
  Array.isArray(v) ? v.map(toJson)
  : v !== null && typeof v === "object"
    ? v.constructor?.name === "Tuple" && "value0" in v && "value1" in v
      ? [toJson(v.value0), toJson(v.value1)]
      : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]))
    : v;

// PureScript functions take one argument at a time, after one per constraint
// in their type. An Eq dictionary is the one Data.Eq builds for JSON values,
// whose `eq` compares with ===.
const dictionary = { eq: { eq: (a) => (b) => a === b }, other: {} };
const call = (f, dicts, args) => [...dicts.map((k) => dictionary[k]), ...args].reduce((g, a) => g(a), f);

// Links the generated ES modules through blob URLs, dependencies first, and
// imports `name`.
function link(modules, name) {
  const urls = new Map();
  const blob = (text) => URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
  const urlOf = (n) => {
    if (urls.has(n)) return urls.get(n);
    const m = modules[n];
    let src = m.src;
    if (m.foreign !== null) src = src.replace(/\.\/foreign\.js/g, blob(m.foreign));
    src = src.replace(/from "\.\.\/([^"/]+)\/index\.js"/g, (_, d) => 'from "' + urlOf(d) + '"');
    const url = blob(src);
    urls.set(n, url);
    return url;
  };
  return import(urlOf(name));
}

self.onmessage = async (e) => {
  const reply = (r) => postMessage(JSON.stringify(r));
  const { modules, main, fn, tests, dicts, typed } = JSON.parse(e.data);
  let mod;
  try {
    mod = await link(modules, main);
  } catch (err) {
    reply({ kind: "error", message: String(err) });
    return;
  }
  const f = mod[typed ? "t0" : fn];
  if (!typed && typeof f !== "function") {
    reply({ kind: "error", message: `${fn} is not exported as a function` });
    return;
  }
  reply({
    kind: "results",
    results: tests.map(({ args, expected }, i) => {
      try {
        const got = toJson(typed ? mod["t" + i]() : call(f, dicts, structuredClone(args)));
        return { pass: same(got, expected), got: show(got) };
      } catch (err) {
        return { pass: false, got: String(err) };
      }
    }),
  });
};
