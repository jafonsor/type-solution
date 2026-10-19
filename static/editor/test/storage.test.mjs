// The storage logic against a fake localStorage with a size quota.
// Run with `npm test --prefix static/editor` (node --test, no dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";

import { saveRun, loadRuns, runsKey } from "../src/storage.mjs";

// A localStorage stand-in that refuses a write taking it over `quota`
// characters (keys and values, as browsers count them).
function fakeStorage(quota, initial = {}) {
  const items = new Map(Object.entries(initial));
  const size = () => [...items].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem(k, v) {
      const before = items.get(k);
      items.set(k, String(v));
      if (size() > quota) {
        if (before === undefined) items.delete(k); else items.set(k, before);
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
    },
    size,
  };
}

const record = (n, presses) => ({
  puzzle: `p${n}`, finishedAt: "2026-10-19T10:00:00Z", seconds: n, wordsPerMinute: 40,
  backspaces: 1, solution: "function f() {}",
  ...(presses ? { keys: "x".repeat(presses), gaps: Array(presses).fill(100) } : {}),
});
const stored = (s) => JSON.parse(s.getItem(runsKey));
const summaries = (runs) => runs.map((r) => r.puzzle);
const withPresses = (runs) => runs.filter((r) => "keys" in r).map((r) => r.puzzle);

test("a Run is appended to the stored Runs", () => {
  const s = fakeStorage(1e6);
  assert.equal(saveRun(s, record(1, 5)), true);
  assert.equal(saveRun(s, record(2, 5)), true);
  assert.deepEqual(stored(s), [record(1, 5), record(2, 5)]);
});

test("when storage is full, only the oldest records lose their key presses, and every summary stays", () => {
  const old = [1, 2, 3, 4, 5].map((n) => record(n, 200));
  const presses = JSON.stringify(record(1, 200)).length - JSON.stringify(record(1, 0)).length;
  // Room for what's there and the new record's summary, plus a bit more
  // than one record's presses: the new record's need one old record's.
  const quota = runsKey.length + JSON.stringify(old).length + JSON.stringify(record(6, 0)).length + 300;
  const s = fakeStorage(quota, { [runsKey]: JSON.stringify(old) });
  assert.ok(presses > 300);
  assert.equal(saveRun(s, record(6, 200)), true);
  let runs = stored(s);
  assert.deepEqual(summaries(runs), ["p1", "p2", "p3", "p4", "p5", "p6"]);
  assert.deepEqual(withPresses(runs), ["p2", "p3", "p4", "p5", "p6"]);
  assert.deepEqual(runs[0], record(1, 0));
  assert.deepEqual(runs[5], record(6, 200));
  // The next Run strips the next oldest, and so on.
  assert.equal(saveRun(s, record(7, 200)), true);
  runs = stored(s);
  assert.deepEqual(summaries(runs), ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(withPresses(runs), ["p3", "p4", "p5", "p6", "p7"]);
});

test("records stored without key presses are skipped over, never dropped", () => {
  const old = [record(1, 0), record(2, 0), record(3, 200), record(4, 200)];
  const quota = JSON.stringify(old).length + runsKey.length + JSON.stringify(record(5, 0)).length + 10;
  const s = fakeStorage(quota, { [runsKey]: JSON.stringify(old) });
  assert.equal(saveRun(s, record(5, 100)), true);
  const runs = stored(s);
  assert.deepEqual(summaries(runs), ["p1", "p2", "p3", "p4", "p5"]);
  assert.deepEqual(withPresses(runs), ["p4", "p5"]);
});

test("a Run that doesn't fit even with every older record stripped isn't kept, and nothing is lost", () => {
  const old = [record(1, 50), record(2, 50)];
  const before = JSON.stringify(old);
  const s = fakeStorage(before.length + runsKey.length + 20, { [runsKey]: before });
  assert.equal(saveRun(s, record(3, 5000)), false);
  assert.equal(s.getItem(runsKey), before);
});

test("storage that can't be used at all doesn't throw; the Run just isn't kept", () => {
  const blocked = {
    getItem() { throw new DOMException("The operation is insecure.", "SecurityError"); },
    setItem() { throw new DOMException("The operation is insecure.", "SecurityError"); },
  };
  assert.equal(saveRun(blocked, record(1, 5)), false);
  // Readable but every write refused for another reason: no stripping loop.
  const readOnly = { getItem: () => null, setItem() { throw new TypeError("no"); } };
  assert.equal(saveRun(readOnly, record(1, 5)), false);
});

test("stored Runs that don't read as a list are left alone", () => {
  for (const bad of ["not json", "{\"a\":1}"]) {
    const s = fakeStorage(1e6, { [runsKey]: bad });
    assert.equal(saveRun(s, record(1, 5)), false);
    assert.equal(s.getItem(runsKey), bad);
  }
});

test("the stored Runs read back as the JSON text saved", () => {
  const s = fakeStorage(1e6);
  assert.equal(loadRuns(s), "[]");
  saveRun(s, record(1, 5));
  saveRun(s, record(2, 0));
  assert.deepEqual(JSON.parse(loadRuns(s)), [record(1, 5), record(2, 0)]);
  // What's there is handed over as it is, for Haskell to read what it can.
  const junk = fakeStorage(1e6, { [runsKey]: "not json" });
  assert.equal(loadRuns(junk), "not json");
});

test("storage that can't be read gives no Runs and doesn't throw", () => {
  const blocked = { getItem() { throw new DOMException("The operation is insecure.", "SecurityError"); } };
  assert.equal(loadRuns(blocked), "[]");
});
