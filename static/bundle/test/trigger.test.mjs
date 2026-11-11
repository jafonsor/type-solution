// The lazy trigger rules. Run: node --test static/bundle/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleToStart, createBundleTrigger } from "../trigger.mjs";

const languages = [{ name: "javascript" }, { name: "purescript", bundle: {} }];
const setup = () => {
  const started = [];
  const t = createBundleTrigger({ languages, start: async (n) => { started.push(n); } });
  return { t, started };
};

test("only a Language with a bundle starts one", () => {
  assert.equal(bundleToStart(languages, "purescript"), "purescript");
  assert.equal(bundleToStart(languages, "javascript"), null);
  assert.equal(bundleToStart(languages, "klingon"), null);
  assert.equal(bundleToStart(languages, null), null);
});

test("JavaScript-only use starts nothing: load, picks, Alt+L back and forth", async () => {
  const { t, started } = setup();
  assert.equal(t.onPageLoad("javascript"), null);
  assert.equal(t.onPick("javascript"), null);
  assert.equal(t.onPageLoad("klingon"), null); // unknown saved value: JavaScript
  assert.equal(t.onPageLoad(undefined), null);
  assert.deepEqual(started, []);
});

test("the first PureScript pick starts the download, later picks do not repeat it", async () => {
  const { t, started } = setup();
  await t.onPick("purescript");
  t.onPick("javascript");
  await t.onPick("purescript");
  await t.onPick("purescript");
  assert.deepEqual(started, ["purescript"]);
  assert.equal(t.status("purescript"), "ready");
});

test("at page load PureScript, if remembered, starts at once; a later pick adds nothing", async () => {
  const { t, started } = setup();
  await t.onPageLoad("purescript");
  await t.onPick("purescript");
  assert.deepEqual(started, ["purescript"]);
});

test("a pick while loading shares the download", async () => {
  let release;
  const started = [];
  const t = createBundleTrigger({ languages, start: (n) => { started.push(n); return new Promise((r) => (release = r)); } });
  const a = t.onPick("purescript");
  const b = t.onPick("purescript");
  assert.equal(t.status("purescript"), "loading");
  assert.equal(a, b);
  release();
  await a;
  assert.deepEqual(started, ["purescript"]);
});

test("a failed download is retried by the next pick or retry, and says failed meanwhile", async () => {
  let fail = true;
  const t = createBundleTrigger({ languages, start: async () => { if (fail) throw new Error("offline"); } });
  await assert.rejects(t.onPick("purescript"), /offline/);
  assert.equal(t.status("purescript"), "failed");
  fail = false;
  await t.retry("purescript");
  assert.equal(t.status("purescript"), "ready");
});

test("status of a Language never asked is idle", () => assert.equal(setup().t.status("purescript"), "idle"));
