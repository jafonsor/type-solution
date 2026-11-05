// Runs a compiled PureScript Main against a Puzzle's tests, in a worker so the
// parent can stop an endless loop. Same pass rule as static/src/js/runner.js:
// compare as JSON with object keys sorted.
import { parentPort, workerData } from "node:worker_threads";
import { sortKeys } from "./puzzle-check.js";

const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));

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

// PureScript functions take one argument at a time.
const call = (f, args) => args.reduce((g, a) => g(a), f);

const { mainUrl, fn, tests } = workerData;
try {
  const f = (await import(mainUrl))[fn];
  if (typeof f !== "function") {
    throw new Error(`${fn} is not exported as a function`);
  }
  parentPort.postMessage({
    kind: "results",
    results: tests.map(({ args, expected }) => {
      try {
        const got = toJson(call(f, structuredClone(args)));
        return { pass: same(got, expected), got: show(got) };
      } catch (err) {
        return { pass: false, got: String(err) };
      }
    }),
  });
} catch (err) {
  parentPort.postMessage({ kind: "error", message: String(err) });
}
