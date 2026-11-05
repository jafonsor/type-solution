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

// PureScript functions take one argument at a time, after one per constraint
// in their type (see dictionaryKinds in purs-runner.js). An Eq dictionary is
// the one Data.Eq builds for JSON values, whose `eq` compares with ===.
const dictionary = { eq: { eq: (a) => (b) => a === b }, other: {} };
const call = (f, dicts, args) => [...dicts.map((k) => dictionary[k]), ...args].reduce((g, a) => g(a), f);

// With `typed`, mainUrl is the generated Harness module (see harnessSource in
// purs-runner.js): its function t<i> takes a unit and makes test i's call, the
// compiler having built the dictionaries.
const { mainUrl, fn, dicts, tests, typed } = workerData;
try {
  const mod = await import(mainUrl);
  const f = mod[fn];
  if (!typed && typeof f !== "function") {
    throw new Error(`${fn} is not exported as a function`);
  }
  parentPort.postMessage({
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
} catch (err) {
  parentPort.postMessage({ kind: "error", message: String(err) });
}
