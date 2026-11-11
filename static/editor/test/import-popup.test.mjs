// The import popup, Language-agnostic, in CodeMirror but without a browser
// (the parts that need real key presses are in browser/drive-imports.mjs).
// A stub Language's rules prove the popup takes any Language's import rules;
// JavaScript, which has none, shows no popup and loses nothing else.
// Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { CompletionContext, completionStatus } from "@codemirror/autocomplete";

import { importSource, importPopup, acceptsPopup, IMPORT_EVENT, MIN_LETTERS, MAX_OFFERS } from "../src/import-popup.mjs";
import { modeExtensions, createMode } from "../src/editor-mode.mjs";
import { javascript } from "../src/languages/javascript.mjs";
import { purescriptEditorSeams } from "../src/languages/purescript.mjs";

// A made-up Language: imports look like `use <module>: <name>` and a table
// maps a name to a module. Nothing PureScript about it.
const stubRules = (table = { alpha: "m1", alphabet: "m2", beta: "m3", used: "m1" }) => ({
  names: async () => table,
  isImportLine: (text) => text.startsWith("use "),
  offers: (t, doc, word, limit) => Object.entries(t)
    .filter(([name]) => name.startsWith(word) && !doc.includes(`: ${name}`))
    .map(([name, module]) => ({ name, module })).slice(0, limit),
  importEdit: (doc, offer) => ({ from: 0, insert: `use ${offer.module}: ${offer.name}\n` }),
});
const stub = { name: "stub", editorMode: () => [], importRules: stubRules() };

const ask = (rules, doc, pos = doc.length) => {
  const state = EditorState.create({ doc, selection: { anchor: pos } });
  return importSource(rules)(new CompletionContext(state, pos, false));
};

// --- when the popup opens ----------------------------------------------------------

test("popup: nothing for fewer than 2 letters, offers from 2", async () => {
  assert.equal(MIN_LETTERS, 2);
  assert.equal(await ask(stubRules(), "f = a"), null);
  const r = await ask(stubRules(), "f = al");
  assert.deepEqual(r.options.map((o) => [o.label, o.detail]), [["alpha", "m1"], ["alphabet", "m2"]]);
  assert.equal(r.from, 4); // the typed letters are what is replaced in the list, not touched
});

test("popup: at most 6 offers", async () => {
  const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`name${i}`, "m"]));
  assert.equal(MAX_OFFERS, 6);
  assert.equal((await ask(stubRules(big), "na")).options.length, 6);
});

test("popup: never on an import line", async () => {
  assert.equal(await ask(stubRules(), "use m1: al"), null);
  assert.ok(await ask(stubRules(), "use m1: alpha\nf = al"));
});

test("popup: a name already imported is not offered (the source runs again on every key, so no validFor)", async () => {
  const r = await ask(stubRules(), "use m1: alpha\nf = al");
  assert.deepEqual(r.options.map((o) => o.label), ["alphabet"]);
  const result = await ask(stubRules(), "f = al");
  assert.equal(result.validFor, undefined);
  assert.equal(result.filter, false);
});

test("popup: no name table (not loaded, or the load failed) means no popup, never an error", async () => {
  const failing = { ...stubRules(), names: async () => { throw new Error("offline"); } };
  assert.equal(await ask(failing, "f = al"), null);
  assert.equal(await ask({ ...stubRules(), names: async () => null }, "f = al"), null);
});

// --- accepting: only the import line -------------------------------------------------

test("accept: dispatches ONE transaction, only the import edit, tagged input.complete", async () => {
  const doc = "f = al";
  const r = await ask(stubRules(), doc);
  let state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [importPopup(stubRules())] });
  const dispatched = [];
  const view = { get state() { return state; }, dispatch(...specs) { dispatched.push(specs); state = state.update(...specs).state; } };
  r.options[0].apply(view, r.options[0], r.from, doc.length);
  const changing = dispatched.filter(([s]) => s.changes);
  assert.equal(changing.length, 1);
  assert.equal(IMPORT_EVENT, "input.complete");
  assert.equal(changing[0][0].userEvent, "input.complete");
  assert.equal(state.doc.toString(), "use m1: alpha\nf = al");        // the typed letters untouched
  assert.equal(state.selection.main.head, state.doc.length);           // the cursor kept its place after them
});

test("accept: the edit is a transaction the key recorder can tell from typing", () => {
  const state = EditorState.create({ doc: "f = al" });
  const tr = state.update({ changes: { from: 0, insert: "use m1: alpha\n" }, userEvent: IMPORT_EVENT });
  assert.equal(tr.isUserEvent("input.complete"), true);
  assert.equal(tr.isUserEvent("input.type"), false);
  assert.equal(state.update({ changes: { from: 6, insert: "p" }, userEvent: "input.type" }).isUserEvent("input.complete"), false);
});

test("key press: Tab or Enter that accepts the open popup is not a key press; anything else is", () => {
  assert.equal(acceptsPopup("Tab", "active"), true);
  assert.equal(acceptsPopup("Enter", "active"), true);
  assert.equal(acceptsPopup("Tab", null), false);       // no popup: Tab indents and counts
  assert.equal(acceptsPopup("Enter", null), false);     // no popup: a newline, counts
  assert.equal(acceptsPopup("Tab", "pending"), false);  // nothing to accept yet
  assert.equal(acceptsPopup("a", "active"), false);     // typing counts, popup or not
  assert.equal(acceptsPopup("Backspace", "active"), false);
});

// --- Tab ----------------------------------------------------------------------------------

// What the browser does with Tab: the Tab bindings in precedence order, until one handles it.
function pressTab(state) {
  let current = state;
  const view = { get state() { return current; }, dispatch(...specs) { current = current.update(...specs).state; } };
  const bindings = current.facet(keymap).flat().filter((b) => b.key === "Tab");
  const results = [];
  for (const b of bindings) { const handled = b.run(view); results.push(handled); if (handled) break; }
  return { doc: current.doc.toString(), results };
}

test("Tab with no popup open falls through to indent (two spaces); the popup's binding returns false", () => {
  const state = EditorState.create({
    doc: "f = al", selection: { anchor: 6 },
    extensions: [modeExtensions(stub), keymap.of([indentWithTab])],
  });
  assert.equal(completionStatus(state), null);
  const { doc, results } = pressTab(state);
  assert.deepEqual(results, [false, true]);      // the popup's Tab declined, indentWithTab took it
  assert.equal(doc, "  f = al");
});

test("a Language without import rules (JavaScript) has no popup, and Tab still indents", () => {
  assert.equal(javascript.importRules, undefined);
  const state = EditorState.create({
    doc: "let x", selection: { anchor: 5 },
    extensions: [modeExtensions(javascript), keymap.of([indentWithTab])],
  });
  assert.equal(completionStatus(state), null);
  const { doc, results } = pressTab(state);
  assert.deepEqual(results, [true]);             // only indentWithTab: no popup binding at all
  assert.equal(doc, "  let x");
});

// --- the mode swap --------------------------------------------------------------------------

test("switching Language swaps only the mode extension: the document, selection and keymaps stay", () => {
  const mode = createMode(javascript);
  const stubLanguage = { ...stub, editorMode: () => [] };
  let state = EditorState.create({ doc: "let x = 1", selection: { anchor: 3 }, extensions: [mode.extension, keymap.of([indentWithTab])] });
  const tabBindings = (s) => s.facet(keymap).flat().filter((b) => b.key === "Tab").length;
  assert.equal(tabBindings(state), 1);
  state = state.update({ effects: mode.switchTo(stubLanguage) }).state;
  assert.equal(tabBindings(state), 2);           // the popup's Tab arrived with the mode...
  assert.equal(state.doc.toString(), "let x = 1"); // ...and nothing else moved
  assert.equal(state.selection.main.head, 3);
  state = state.update({ effects: mode.switchTo(javascript) }).state;
  assert.equal(tabBindings(state), 1);           // and left with it
  assert.equal(state.doc.toString(), "let x = 1");
});

test("PureScript's seams plug into the same popup: its import rules make a popup, its mode is the extension", async () => {
  const table = { modules: { "Data.Array": [["take", "value"]] }, preferred: {} };
  const seams = purescriptEditorSeams({ loadNames: async () => table });
  const language = { name: "ps", ...seams };
  const state = EditorState.create({ doc: "f = ta", extensions: [modeExtensions(language)] });
  const r = await importSource(language.importRules)(new CompletionContext(state, 6, false));
  assert.deepEqual(r.options.map((o) => [o.label, o.detail]), [["take", "Data.Array"]]);
});
