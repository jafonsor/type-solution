// The spare-worker logic against a fake Worker class.
// Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createChecker } from "../src/checker.mjs";

function fakeWorkers() {
  const made = [];
  class FakeWorker {
    constructor(url, opts) {
      this.url = url; this.opts = opts;
      this.sent = []; this.terminated = false; this.onmessage = null;
      made.push(this);
    }
    postMessage(m) { this.sent.push(m); }
    terminate() { this.terminated = true; }
  }
  return { FakeWorker, made };
}

test("one spare starts at creation, from the script's own address, as a module", () => {
  const { FakeWorker, made } = fakeWorkers();
  createChecker(FakeWorker, "js/runner.js");
  assert.equal(made.length, 1);
  assert.equal(made[0].url, "js/runner.js");
  assert.deepEqual(made[0].opts, { type: "module" });
  assert.deepEqual(made[0].sent, []);
});

test("a check takes the spare and starts the next one", () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = createChecker(FakeWorker, "r.js");
  c.start("req1", () => {});
  assert.equal(made.length, 2);
  assert.deepEqual(made[0].sent, ["req1"]);
  assert.deepEqual(made[1].sent, []); // the new spare has run nothing
  c.start("req2", () => {});
  assert.equal(made.length, 3);
  assert.deepEqual(made[1].sent, ["req2"]);
  assert.deepEqual(made[2].sent, []);
});

test("every worker gets at most one request: none is reused", () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = createChecker(FakeWorker, "r.js");
  for (let i = 0; i < 5; i++) { c.start("r" + i, () => {}); c.stop(); }
  assert.ok(made.every((w) => w.sent.length <= 1));
  assert.equal(made.filter((w) => w.sent.length === 1).length, 5);
});

test("the reply reaches the callback; stop terminates that worker, not the spare", () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = createChecker(FakeWorker, "r.js");
  const got = [];
  c.start("req", (r) => got.push(r));
  made[0].onmessage({ data: "reply" });
  assert.deepEqual(got, ["reply"]);
  c.stop();
  assert.equal(made[0].terminated, true);
  assert.equal(made[1].terminated, false);
});

test("a newer check terminates the one in flight, and its late reply is dropped", () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = createChecker(FakeWorker, "r.js");
  const got = [];
  c.start("a", (r) => got.push(["a", r]));
  const first = made[0];
  c.start("b", (r) => got.push(["b", r]));
  assert.equal(first.terminated, true);
  assert.equal(first.onmessage, null);
  assert.equal(made[1].terminated, false);
});

test("after an endless loop is stopped, the next check works on a fresh worker", () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = createChecker(FakeWorker, "r.js");
  c.start("loop", () => {});
  c.stop(); // the 1 s timeout does this
  assert.equal(made[0].terminated, true);
  const got = [];
  c.start("next", (r) => got.push(r));
  assert.deepEqual(made[1].sent, ["next"]);
  made[1].onmessage({ data: "ok" });
  assert.deepEqual(got, ["ok"]);
});

test("stop with nothing in flight does nothing", () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = createChecker(FakeWorker, "r.js");
  c.stop();
  assert.equal(made[0].terminated, false);
});
