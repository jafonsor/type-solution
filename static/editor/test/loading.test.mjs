// The loading state the status line shows: loading with a percentage, ready,
// failed, replayed to a late watcher, retried. Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoadingStore, reportingStart } from "../src/loading.mjs";
import { createBundleTrigger } from "../../bundle/trigger.mjs";

test("a download reports loading with its percentage, then ready", async () => {
  const store = createLoadingStore();
  const seen = [];
  store.watch((n, s, p) => seen.push([n, s, p]));
  let finish;
  const languages = { slow: { name: "slow", bundle: { start: ({ onProgress }) => new Promise((resolve) => { onProgress(40); finish = resolve; }) } } };
  const start = reportingStart(store, (n) => languages[n]);
  const done = start("slow");
  assert.deepEqual(seen, [["slow", "loading", 0], ["slow", "loading", 40]]);
  finish();
  await done;
  assert.deepEqual(seen.at(-1), ["slow", "ready", -1]);
  assert.deepEqual(store.get("slow"), { state: "ready", percent: -1 });
});

test("a failure is reported and passed on; the retry (the trigger's) starts it again", async () => {
  const store = createLoadingStore();
  let fail = true;
  const languages = [{ name: "x", bundle: { start: async () => { if (fail) throw new Error("offline"); } } }];
  const trigger = createBundleTrigger({ languages, start: reportingStart(store, (n) => languages.find((l) => l.name === n)) });
  const first = trigger.onPick("x");
  await assert.rejects(first, /offline/);
  assert.equal(store.get("x").state, "failed");
  fail = false;
  await trigger.retry("x");
  assert.equal(store.get("x").state, "ready");
});

test("a watcher that comes late is told what already happened", () => {
  const store = createLoadingStore();
  store.set("a", "loading", 12);
  store.set("b", "failed");
  const seen = [];
  store.watch((n, s, p) => seen.push([n, s, p]));
  assert.deepEqual(seen, [["a", "loading", 12], ["b", "failed", -1]]);
});

test("an unchanged state is not announced again; a Language never asked is idle", () => {
  const store = createLoadingStore();
  const seen = [];
  store.watch((...a) => seen.push(a));
  store.set("a", "loading", 5);
  store.set("a", "loading", 5);
  assert.equal(seen.length, 1);
  assert.deepEqual(store.get("zzz"), { state: "idle", percent: -1 });
});
