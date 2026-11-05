// The Language seams: JavaScript as a value, and a second, fake Language
// proving the run and the editor take the Language as an argument.
// Run with `npm test --prefix static/editor`.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";

import { languageNamed, registerLanguage, languageNames, DEFAULT_LANGUAGE } from "../src/languages.mjs";
import { createCheckSession } from "../src/run-check.mjs";
import { createMode } from "../src/editor-mode.mjs";
import { javascript } from "../src/languages/javascript.mjs";

// A Worker that answers every request with a runner reply built by `answer`.
function fakeWorkers(answer) {
  const made = [];
  class FakeWorker {
    constructor(url, opts) { this.url = url; this.terminated = false; this.onmessage = null; made.push(this); }
    postMessage(m) { this.sent = m; if (answer) queueMicrotask(() => this.onmessage?.({ data: answer(JSON.parse(m)) })); }
    terminate() { this.terminated = true; }
  }
  return { FakeWorker, made };
}

const tests = [{ args: [1], expected: 2 }];

// --- JavaScript, the value --------------------------------------------------

test("JavaScript is registered, is the default, and has the four seams", () => {
  assert.equal(DEFAULT_LANGUAGE, "javascript");
  assert.equal(languageNamed("javascript"), javascript);
  assert.equal(languageNamed("no-such-language"), javascript);
  assert.equal(languageNamed(undefined), javascript);
  assert.equal(typeof javascript.createChecker, "function"); // Checker
  assert.equal(typeof javascript.editorMode, "function");    // Editor mode
  assert.equal(javascript.importRules, undefined);           // Import rules: none
  assert.equal(javascript.folder, "languages/javascript");   // bank folder
  assert.equal(javascript.settings.runTimeoutMs, 1000);
});

test("JavaScript's editor mode is a CodeMirror extension", () => {
  const state = EditorState.create({ doc: "let x = 1;", extensions: [javascript.editorMode()] });
  assert.ok(state.facet(EditorState.languageData).length > 0);
});

test("JavaScript: code that doesn't parse fails at once, with line, column and range, and no worker runs it", async () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = javascript.createChecker({ Worker: FakeWorker, url: "r.js" });
  const r = await c.check("let x = ;\n", "f", tests);
  assert.equal(r.status, "error");
  assert.equal(r.kind, "syntax");
  assert.match(r.message, /Unexpected token \(1:8\)/);
  assert.equal(r.line, 1);
  assert.equal(r.column, 8);
  assert.deepEqual(r.range, { from: 8, to: 9 });
  assert.ok(made.every((w) => w.sent === undefined));
});

test("JavaScript: a pass, a fail, and a crash come back as results", async () => {
  const replies = [
    { kind: "results", results: [{ pass: true, got: "2" }] },
    { kind: "results", results: [{ pass: true, got: "2" }, { pass: false, got: "3" }] },
    { kind: "error", message: "ReferenceError: x is not defined" },
  ];
  const { FakeWorker, made } = fakeWorkers(() => JSON.stringify(replies.shift()));
  const c = javascript.createChecker({ Worker: FakeWorker, url: "r.js" });
  const a = await c.check("function f(a){return a+1}", "f", tests);
  assert.equal(a.status, "pass");
  assert.deepEqual(a.results, [{ pass: true, got: "2" }]);
  assert.deepEqual(JSON.parse(made[0].sent), { code: "function f(a){return a+1}", fn: "f", tests });
  const b = await c.check("function f(a){return a+1}", "f", tests);
  assert.equal(b.status, "fail");
  assert.equal(b.results.length, 2);
  const e = await c.check("function f(a){return a+1}", "f", tests);
  assert.equal(e.status, "error");
  assert.equal(e.kind, "crash");
  assert.equal(e.message, "ReferenceError: x is not defined");
  assert.ok(made.slice(0, 3).every((w) => w.terminated), "a worker that ran a Solution is never reused");
});

test("JavaScript: a check still running after the run timeout is stopped and times out", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { FakeWorker, made } = fakeWorkers(); // never answers: an endless loop
    const c = javascript.createChecker({ Worker: FakeWorker, url: "r.js" });
    const p = c.check("while(true){}", "f", tests);
    mock.timers.tick(999);
    assert.equal(made[0].terminated, false);
    mock.timers.tick(1);
    const r = await p;
    assert.equal(r.status, "error");
    assert.equal(r.kind, "timeout");
    assert.match(r.message, /^Stopped after 1.0 s: an infinite loop\?$/);
    assert.equal(made[0].terminated, true);
    assert.equal(made[1].terminated, false, "the spare stays");
  } finally { mock.timers.reset(); }
});

test("JavaScript: a newer check ends the older one as stopped", async () => {
  const { FakeWorker, made } = fakeWorkers();
  const c = javascript.createChecker({ Worker: FakeWorker, url: "r.js" });
  const older = c.check("x", "f", tests);
  const newer = c.check("y", "f", tests);
  assert.equal((await older).kind, "stopped");
  assert.equal(made[0].terminated, true);
  c.stop();
  assert.equal((await newer).kind, "stopped");
});

// --- a second, fake Language -------------------------------------------------

function fakeLanguage() {
  const calls = [];
  const waiting = [];
  const language = {
    name: "fake",
    title: "Fake",
    folder: "languages/fake",
    settings: { runTimeoutMs: 5, compileTimeoutMs: 50 },
    createChecker(env) {
      calls.push(["createChecker", env]);
      return {
        check(code, fn, tests) {
          calls.push(["check", code, fn, tests]);
          return new Promise((resolve) => waiting.push(resolve));
        },
        stop() { calls.push(["stop"]); },
      };
    },
    editorMode: () => EditorState.languageData.of(() => [{ fakeLanguage: true }]),
    importRules: { edit: () => null },
  };
  return { language, calls, waiting };
}
const result = (status) => ({ status, message: "", line: 1, column: 0, results: [] });

test("the run takes the Language as an argument and talks only to its Checker", async () => {
  const { language, calls, waiting } = fakeLanguage();
  const env = { Worker: class {}, url: "fake.js" };
  const session = createCheckSession(language, env);
  assert.deepEqual(calls[0], ["createChecker", env]);
  const replies = [];
  session.start(JSON.stringify({ code: "c", fn: "f", tests }), (r) => replies.push(JSON.parse(r)));
  assert.deepEqual(calls[1], ["check", "c", "f", tests]);
  waiting[0](result("pass"));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(replies, [result("pass")]);
});

test("a newer edit makes the older result ignored, for any Language", async () => {
  const { language, waiting } = fakeLanguage();
  const session = createCheckSession(language, {});
  const replies = [];
  const req = JSON.stringify({ code: "c", fn: "f", tests });
  session.start(req, (r) => replies.push(["old", JSON.parse(r).status]));
  session.start(req, (r) => replies.push(["new", JSON.parse(r).status]));
  waiting[1](result("fail"));
  waiting[0](result("pass")); // late, and older
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(replies, [["new", "fail"]]);
  // stop() drops the result of the check in flight, and stops the Checker
  const { language: l2, calls, waiting: w2 } = fakeLanguage();
  const s2 = createCheckSession(l2, {});
  s2.start(req, (r) => replies.push(["stopped", r]));
  s2.stop();
  w2[0](result("pass"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(replies.length, 1);
  assert.deepEqual(calls.at(-1), ["stop"]);
});

test("a Checker that throws gives a crash result, not a lost check", async () => {
  const { language } = fakeLanguage();
  language.createChecker = () => ({ check: () => Promise.reject(new Error("boom")), stop() {} });
  const session = createCheckSession(language, {});
  const got = await new Promise((resolve) =>
    session.start(JSON.stringify({ code: "", fn: "f", tests }), (r) => resolve(JSON.parse(r))));
  assert.equal(got.status, "error");
  assert.equal(got.kind, "crash");
  assert.match(got.message, /boom/);
});

test("a registered Language is found by name; JavaScript stays the default", () => {
  const { language } = fakeLanguage();
  registerLanguage(language);
  assert.equal(languageNamed("fake"), language);
  assert.equal(languageNamed("nope"), javascript);
  assert.deepEqual(languageNames().sort(), ["fake", "javascript"]);
});

test("swapping Language swaps only the editor mode extension", () => {
  const { language } = fakeLanguage();
  const mode = createMode(javascript);
  const other = { marker: "kept" };
  const keep = EditorState.languageData.of(() => [other]); // not in the mode compartment
  let state = EditorState.create({ doc: "let a = 1", extensions: [mode.extension, keep] });
  assert.equal(state.languageDataAt("fakeLanguage", 0).length, 0);
  state = state.update({ effects: mode.switchTo(language) }).state;
  // the fake's data is there; the unrelated extension and the text are untouched
  assert.deepEqual(state.languageDataAt("fakeLanguage", 0), [true]);
  assert.deepEqual(state.languageDataAt("marker", 0), ["kept"]);
  assert.equal(state.doc.toString(), "let a = 1");
  state = state.update({ effects: mode.switchTo(javascript) }).state;
  assert.equal(state.languageDataAt("fakeLanguage", 0).length, 0);
});

test("import rules are optional: a Language without them is complete", () => {
  const { language } = fakeLanguage();
  assert.equal(typeof language.importRules.edit, "function");
  assert.equal(javascript.importRules, undefined);
});

// --- nothing JavaScript-specific outside the JavaScript Language value -------

test("only languages/javascript.mjs names acorn, the JavaScript mode or the runner", () => {
  const dir = new URL("../src/", import.meta.url);
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? walk(new URL(e.name + "/", d)) : files.push(new URL(e.name, d)));
  walk(dir);
  const home = new URL("languages/javascript.mjs", dir).href;
  for (const f of files.filter((f) => f.href !== home)) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/acorn|lang-javascript|runner\.js/.test(text.replace(/\/\/.*$/gm, "")), f.pathname);
    assert.ok(!/import .*languages\/javascript/.test(text) || f.pathname.endsWith("languages.mjs"), f.pathname);
  }
});
