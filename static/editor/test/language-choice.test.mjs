// The Language dropdown's rules: order and Alt+L, drafts, the remembered
// choice. All data-driven from a list of names, so a second, stub Language
// proves the multi-Language behaviour. Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";

import {
  languageKey, rememberedLanguage, rememberLanguage, nextLanguage, createDrafts, createLanguageChoice,
} from "../src/language-choice.mjs";
import { languageNamed, registerLanguage, languageList } from "../src/languages.mjs";
import { createMode } from "../src/editor-mode.mjs";
import { createBundleTrigger } from "../../bundle/trigger.mjs";

const names = ["javascript", "purescript"];

function fakeStorage(initial = {}) {
  const items = { ...initial };
  return {
    items,
    getItem: (k) => (k in items ? items[k] : null),
    setItem: (k, v) => { items[k] = String(v); },
  };
}

// --- the remembered Language --------------------------------------------------

test("remembered Language: first visit, or an unknown saved value, is JavaScript", () => {
  assert.equal(languageKey, "type-solution.language");
  assert.equal(rememberedLanguage(fakeStorage(), names, "javascript"), "javascript");
  assert.equal(rememberedLanguage(fakeStorage({ [languageKey]: "klingon" }), names, "javascript"), "javascript");
  assert.equal(rememberedLanguage(fakeStorage({ [languageKey]: "" }), names, "javascript"), "javascript");
});

test("remembered Language: a saved known name comes back; unreadable storage is JavaScript", () => {
  assert.equal(rememberedLanguage(fakeStorage({ [languageKey]: "purescript" }), names, "javascript"), "purescript");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(rememberedLanguage(blocked, names, "javascript"), "javascript");
  rememberLanguage(blocked, "purescript"); // never throws
});

test("remembered Language: it is read once, on page load, and written on every pick", () => {
  const storage = fakeStorage({ [languageKey]: "purescript" });
  const choice = createLanguageChoice({ names, fallback: "javascript", storage });
  assert.equal(choice.current, "purescript");
  storage.items[languageKey] = "javascript"; // changed behind its back (another tab)
  assert.equal(choice.current, "purescript");
  choice.pick("javascript", "x");
  assert.equal(storage.items[languageKey], "javascript");
  choice.cycle("x");
  assert.equal(storage.items[languageKey], "purescript");
});

test("a new Puzzle opens in the last Language chosen: reset keeps the Language", () => {
  const choice = createLanguageChoice({ names, fallback: "javascript", storage: fakeStorage() });
  choice.pick("purescript", "a");
  choice.reset();
  assert.equal(choice.current, "purescript");
});

// --- Language order and Alt+L ---------------------------------------------------

test("Alt+L cycles the Languages in list order and wraps round", () => {
  assert.equal(nextLanguage(names, "javascript"), "purescript");
  assert.equal(nextLanguage(names, "purescript"), "javascript");
  assert.equal(nextLanguage(["a", "b", "c"], "c"), "a");
  assert.equal(nextLanguage(["only"], "only"), "only");
  const choice = createLanguageChoice({ names: ["a", "b", "c"], fallback: "a", storage: fakeStorage() });
  assert.deepEqual([1, 2, 3, 4].map(() => choice.cycle("").name), ["b", "c", "a", "b"]);
});

test("the dropdown is data-driven: a third Language joins the cycle with no other change", () => {
  const choice = createLanguageChoice({ names: [...names, "elm"], fallback: "javascript", storage: fakeStorage() });
  assert.deepEqual([1, 2, 3].map(() => choice.cycle("").name), ["purescript", "elm", "javascript"]);
});

test("picking the current or an unknown Language changes nothing", () => {
  const storage = fakeStorage();
  const picks = [];
  const choice = createLanguageChoice({ names, fallback: "javascript", storage, onPick: (n) => picks.push(n) });
  assert.equal(choice.pick("javascript", "x"), null);
  assert.equal(choice.pick("klingon", "x"), null);
  assert.equal(choice.current, "javascript");
  assert.deepEqual(picks, []);
  assert.deepEqual(storage.items, {});
});

// --- drafts ---------------------------------------------------------------------

test("each Language keeps its own draft: switching away and back restores it", () => {
  const choice = createLanguageChoice({ names, fallback: "javascript", storage: fakeStorage() });
  // The player types in JavaScript, switches, types in PureScript, switches back.
  assert.deepEqual(choice.pick("purescript", "function f() {}"), { name: "purescript", draft: undefined });
  assert.deepEqual(choice.pick("javascript", "f x = x"), { name: "javascript", draft: "function f() {}" });
  assert.deepEqual(choice.pick("purescript", "function f() { return 1 }"), { name: "purescript", draft: "f x = x" });
});

test("an untouched Language opens empty: no draft, nothing pre-filled", () => {
  const choice = createLanguageChoice({ names, fallback: "javascript", storage: fakeStorage() });
  assert.equal(choice.pick("purescript", "typed").draft, undefined);
  const drafts = createDrafts();
  assert.equal(drafts.get("purescript"), undefined);
});

test("a new Run drops every draft; a reload (a new choice) starts with none", () => {
  const choice = createLanguageChoice({ names, fallback: "javascript", storage: fakeStorage() });
  choice.pick("purescript", "js draft");
  choice.reset();
  assert.equal(choice.pick("javascript", "ps draft").draft, undefined);
  const reloaded = createLanguageChoice({ names, fallback: "javascript", storage: fakeStorage() });
  assert.equal(reloaded.pick("purescript", "").draft, undefined);
});

test("drafts hold whole editor states: text and cursor come back", () => {
  const choice = createLanguageChoice({ names, fallback: "javascript", storage: fakeStorage() });
  const typed = EditorState.create({ doc: "return 1;", selection: { anchor: 3 } });
  choice.pick("purescript", typed);
  const back = choice.pick("javascript", EditorState.create({ doc: "f = 1" })).draft;
  assert.equal(back.doc.toString(), "return 1;");
  assert.equal(back.selection.main.head, 3);
});

// --- a stub second Language in the registry ---------------------------------------

test("a second registered Language appears in the list, with its own mode, signature-free", () => {
  const stubMode = [];
  registerLanguage({
    name: "stub", title: "Stub", folder: "languages/stub", settings: {},
    createChecker: () => ({ check: async () => ({ status: "pass" }), stop() {} }),
    editorMode: () => stubMode, bundle: { start: async () => {} },
  });
  const list = languageList();
  assert.deepEqual(list.map((l) => l.name), ["javascript", "purescript", "stub"]);
  assert.deepEqual(list.map((l) => l.title), ["JavaScript", "PureScript", "Stub"]);
  // Switching swaps only the language extension of the same state.
  const js = languageNamed("javascript");
  const mode = createMode(js);
  const state = EditorState.create({ doc: "kept", extensions: [mode.extension] });
  const next = state.update({ effects: mode.switchTo(languageNamed("stub")) }).state;
  assert.equal(next.doc.toString(), "kept");
});

test("picks start a Language's bundle through the trigger: first pick, not JavaScript", async () => {
  const started = [];
  const languages = [{ name: "javascript" }, { name: "stub", bundle: {} }];
  const trigger = createBundleTrigger({ languages, start: async (n) => { started.push(n); } });
  const choice = createLanguageChoice({
    names: ["javascript", "stub"], fallback: "javascript", storage: fakeStorage(), onPick: (n) => trigger.onPick(n),
  });
  choice.cycle("");            // stub
  choice.cycle("");            // javascript
  choice.cycle("");            // stub again
  assert.deepEqual(started, ["stub"]);
});
