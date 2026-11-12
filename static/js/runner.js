// The test runner: runs a Solution against a Puzzle's tests. The app starts a
// fresh module worker per check and terminates it on timeout or when a newer
// check supersedes it, so an infinite loop can't hang the page.
//
// Gets:   JSON text {code, fn, tests: [{args, expected}]}
// Sends:  JSON text {kind: "results", results: [{pass, got}]}
//                or {kind: "error", message}
const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));

// A pass compares results as JSON with object keys sorted (arrays keep their
// order). The app's request sorts object keys (aeson), so `expected` carries
// no key order, and a Solution's key order must not decide a pass.
const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys)
  : v !== null && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v;
// `expected` is JSON, so a result that isn't (undefined, a function) fails.
const same = (got, expected) => {
  const g = show(got);
  return g !== undefined && g !== "undefined" &&
    JSON.stringify(sortKeys(JSON.parse(g))) === JSON.stringify(sortKeys(expected));
};

self.onmessage = (e) => {
  const reply = (r) => postMessage(JSON.stringify(r));
  const { code, fn, tests } = JSON.parse(e.data);
  let f;
  try {
    f = new Function('"use strict";\n' + code + "\n;return " + fn + ";")();
  } catch (err) {
    reply({ kind: "error", message: String(err) });
    return;
  }
  if (typeof f !== "function") {
    reply({ kind: "error", message: fn + " is not a function" });
    return;
  }
  reply({
    kind: "results",
    results: tests.map(({ args, expected }) => {
      try {
        const got = f(...structuredClone(args));
        return { pass: same(got, expected), got: show(got) };
      } catch (err) {
        return { pass: false, got: String(err) };
      }
    }),
  });
};
