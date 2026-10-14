// The test runner: runs a Solution against a Puzzle's tests. The app starts a
// fresh module worker per check and terminates it on timeout or when a newer
// check supersedes it, so an infinite loop can't hang the page.
//
// Gets:   JSON text {code, fn, tests: [{args, expected}]}
// Sends:  JSON text {kind: "results", results: [{pass, got}]}
//                or {kind: "error", message}
const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));

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
        return { pass: show(got) === show(expected), got: show(got) };
      } catch (err) {
        return { pass: false, got: String(err) };
      }
    }),
  });
};
