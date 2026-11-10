// PureScript's editor mode and import rules, pure (no browser): the import
// edit, the merge, and which names are offered. Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { syntaxTree, indentService } from "@codemirror/language";

import { purescriptMode, importEdit, offers, readImports, isImportLine, purescriptImportRules, namesFromBundle, purescriptEditorSeams } from "../src/languages/purescript.mjs";

// The shape of names.<hash>.json (tools/purs-bundle/build.mjs), reduced.
const table = {
  packageSet: "test",
  modules: {
    Prelude: [["map", "value"], ["show", "value"], ["Show", "class"], ["<>", "operator"], ["pure", "value"]],
    "Data.Array": [["drop", "value"], ["filter", "value"], ["length", "value"], ["take", "value"], ["takeWhile", "value"], ["!!", "operator"]],
    "Data.List": [["filter", "value"], ["length", "value"], ["take", "value"]],
    "Data.Foldable": [["foldl", "value"], ["length", "value"], ["Foldable", "class"]],
    "Data.Maybe": [["Maybe", "type"], ["fromMaybe", "value"]],
    "Data.Lazy": [["force", "value"], ["fromThing", "value"]],
    "Data.Other": [["force", "value"]],
    "Data.Show": [["toString", "value"], ["constructor", "value"]],
  },
  preferred: { length: ["Data.Array", "Data.Foldable", "Data.List"], filter: ["Data.Array", "Data.List"], take: ["Data.Array", "Data.List"] },
};
const apply = (doc, edit) => doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to ?? edit.from);
const add = (doc, name, module, kind = "value") => apply(doc, importEdit(doc, { name, module, kind }));
const names = (doc, word, limit = 6) => offers(table, doc, word, limit).map((o) => `${o.name} ${o.module}`);

// --- the import edit ----------------------------------------------------------

test("import edit: no imports adds a line at the top with a blank line below", () => {
  assert.equal(add("f = ta", "take", "Data.Array"), "import Data.Array (take)\n\nf = ta");
  assert.equal(add("", "take", "Data.Array"), "import Data.Array (take)\n\n");
});

test("import edit: with imports it goes after the last import", () => {
  const doc = "import Prelude\nimport Data.Maybe (Maybe)\n\nf = ta";
  assert.equal(add(doc, "take", "Data.Array"), "import Prelude\nimport Data.Maybe (Maybe)\nimport Data.Array (take)\n\nf = ta");
});

test("import edit: it merges into `import M (...)`: take then drop gives import Data.Array (take, drop)", () => {
  const first = add("f = ta", "take", "Data.Array");
  assert.equal(add(first, "drop", "Data.Array"), "import Data.Array (take, drop)\n\nf = ta");
  // and a third
  assert.equal(add(add(first, "drop", "Data.Array"), "length", "Data.Array"), "import Data.Array (take, drop, length)\n\nf = ta");
});

test("import edit: it merges into the line of its own module, not another's", () => {
  const doc = "import Data.List (take)\nimport Data.Array (drop)\n\nf = ";
  assert.equal(add(doc, "filter", "Data.Array"), "import Data.List (take)\nimport Data.Array (drop, filter)\n\nf = ");
});

test("import edit: a list with spaces or members, an empty list", () => {
  assert.equal(add("import Data.Maybe ( Maybe(..) )\nf", "fromMaybe", "Data.Maybe"), "import Data.Maybe ( Maybe(..), fromMaybe)\nf");
  assert.equal(add("import Data.Array ()\nf", "take", "Data.Array"), "import Data.Array (take)\nf");
});

test("import edit: a class is imported as `class Name`", () => {
  assert.equal(add("f", "Foldable", "Data.Foldable", "class"), "import Data.Foldable (class Foldable)\n\nf");
  assert.equal(add("import Data.Foldable (foldl)\n", "Foldable", "Data.Foldable", "class"), "import Data.Foldable (foldl, class Foldable)\n");
});

test("import edit: a bare `import M` or a qualified one is not merged into; a new line is added", () => {
  assert.equal(add("import Data.Array\nf", "take", "Data.List"), "import Data.Array\nimport Data.List (take)\nf");
  assert.equal(add("import Data.Array as A\nf", "take", "Data.Array"), "import Data.Array as A\nimport Data.Array (take)\nf");
});

test("import edit: it is ONE change that touches only the import, so the typed text and the cursor survive", () => {
  const doc = "f = ta";
  const edit = importEdit(doc, { name: "take", module: "Data.Array", kind: "value" });
  assert.equal(typeof edit.from, "number");
  assert.ok(!Array.isArray(edit));
  const state = EditorState.create({ doc, selection: { anchor: doc.length } });
  const next = state.update({ changes: edit }).state;
  assert.equal(next.doc.toString().endsWith("f = ta"), true);
  assert.equal(next.selection.main.head, next.doc.length); // the cursor still follows "ta"
});

// --- which names are offered ---------------------------------------------------

test("offers: matching names with their module, alphabetical, case-insensitive", () => {
  assert.deepEqual(names("", "ta"), ["take Data.Array", "take Data.List", "takeWhile Data.Array"]);
  assert.deepEqual(names("", "TA"), ["take Data.Array", "take Data.List", "takeWhile Data.Array"]);
});

test("offers: at most 6", () => {
  assert.equal(names("", "f").length, 6);
  assert.equal(offers(table, "", "f", 3).length, 3);
});

test("offers: a name two modules export lists the preferred module first", () => {
  assert.deepEqual(names("", "len"), ["length Data.Array", "length Data.Foldable", "length Data.List"]);
  // a name with no preference: modules in alphabetical order
  assert.deepEqual(names("", "force"), ["force Data.Lazy", "force Data.Other"]);
});

test("offers: a name that is also an Object.prototype property (toString, constructor) works", () => {
  assert.deepEqual(names("", "toS"), ["toString Data.Show"]);
  assert.deepEqual(names("", "constr"), ["constructor Data.Show"]);
});

test("offers: Prelude names are not offered, from any module", () => {
  assert.deepEqual(names("", "ma"), ["Maybe Data.Maybe"]); // Maybe is not Prelude's; map is
  assert.deepEqual(names("", "sh"), []);
  assert.deepEqual(names("", "pu"), []);
});

test("offers: operators are not offered", () => {
  assert.deepEqual(names("", "!!"), []);
});

test("offers: a name already imported (from any module) is not offered", () => {
  assert.deepEqual(names("import Data.Array (take)\nf = ta", "ta"), ["takeWhile Data.Array"]);
  assert.deepEqual(names("import Data.List (take)\nf = ta", "ta"), ["takeWhile Data.Array"]); // not from Data.Array either
  assert.deepEqual(names("import Data.Maybe (Maybe(..), fromMaybe)\n", "from"), ["fromThing Data.Lazy"]);
  assert.deepEqual(names("import Data.Foldable (class Foldable)\n", "Fold"), ["foldl Data.Foldable"]); // the class is gone, foldl is a different name
});

test("offers: names of a module imported whole are not offered from it", () => {
  assert.deepEqual(names("import Data.Array\nf = ta", "ta"), ["take Data.List"]);
});

test("offers: after merging, the merged name is no longer offered", () => {
  const doc = add("f = ta", "take", "Data.Array");
  assert.deepEqual(names(doc, "take"), ["takeWhile Data.Array"]); // not from Data.List either: it is imported
});

test("import lines: recognised, and never a place to offer", () => {
  assert.equal(isImportLine("import Data.Array (take)"), true);
  assert.equal(isImportLine("  import X"), true);
  assert.equal(isImportLine("importantThing = 1"), false);
  assert.equal(isImportLine("f = ta"), false);
  assert.deepEqual([...readImports("import Prelude\nimport Data.Array (take, drop)\nf").names], ["take", "drop"]);
});

// --- the rules value ------------------------------------------------------------

test("rules: the name table is loaded once and parsed from text; a failed load is tried again", async () => {
  let calls = 0;
  const rules = purescriptImportRules({ loadNames: async () => { calls++; return JSON.stringify(table); } });
  assert.equal((await rules.names()).packageSet, "test");
  await rules.names();
  assert.equal(calls, 1);
  let fail = true;
  const flaky = purescriptImportRules({ loadNames: async () => { if (fail) throw new Error("offline"); return table; } });
  await assert.rejects(flaky.names(), /offline/);
  fail = false;
  assert.equal((await flaky.names()).packageSet, "test");
});

test("rules: the table comes from the bundle's `names` file", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(table));
  const bundle = { core: async (name) => { assert.equal(name, "names"); return bytes; } };
  assert.equal(JSON.parse(await namesFromBundle(bundle)()).packageSet, "test");
  const seams = purescriptEditorSeams({ loadNames: namesFromBundle(bundle) });
  assert.equal(typeof seams.editorMode, "function");
  assert.deepEqual(Object.keys(seams.importRules).sort(), ["importEdit", "isImportLine", "names", "offers"]);
});

// --- the editor mode --------------------------------------------------------------

const stateOf = (doc) => EditorState.create({ doc, extensions: [purescriptMode()] });
const tokens = (doc) => {
  const out = [];
  syntaxTree(stateOf(doc)).iterate({ enter: (n) => { if (n.name && n.from < n.to) out.push([n.name, doc.slice(n.from, n.to)]); } });
  return out;
};

test("mode: colours keywords, strings, comments, numbers, and PureScript's own keywords", () => {
  const t = tokens('f :: forall a. a -> Int\nf x = if true then 1 else 2 -- note\ns = "hi"');
  const kind = (text) => t.find(([, s]) => s === text)?.[0];
  assert.equal(kind("forall"), "keyword");
  assert.equal(kind("if"), "keyword");
  assert.equal(kind("then"), "keyword");
  assert.equal(kind("true"), "bool");
  assert.equal(kind("1"), "number");
  assert.equal(kind("-- note"), "comment");
  assert.equal(kind('"hi"'), "string");
  assert.equal(kind("->"), "keyword");
});

test("mode: operators are operators, not plain names", () => {
  const t = tokens("f = a <$> b <> c");
  assert.equal(t.find(([, s]) => s === "<$>")[0], "operator");
  assert.equal(t.find(([, s]) => s === "<>")[0], "operator");
});

test("mode: a triple-quoted raw string, even over several lines and with quotes inside, is one string", () => {
  const doc = 's = """one "two"\nthree"""\nn = 1';
  const t = tokens(doc);
  assert.ok(t.filter(([n]) => n === "string").map(([, s]) => s).join("").includes("three"));
  assert.equal(t.find(([, s]) => s === "1")[0], "number");
  assert.ok(!t.some(([n]) => n === "invalid"));
});

test("mode: comments use -- and {- -}", () => {
  const data = stateOf("").languageDataAt("commentTokens", 0)[0];
  assert.equal(data.line, "--");
  assert.deepEqual(data.block, { open: "{-", close: "-}" });
});

test("mode: Enter indents like the last line, and one more after where, do, of, = or ->", () => {
  const enter = (doc) => {
    let state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [purescriptMode()] });
    insertNewlineAndIndent({ state, dispatch: (tr) => { state = tr.state; } });
    return state.doc.toString().slice(doc.length);
  };
  assert.equal(enter("f x ="), "\n  ");
  assert.equal(enter("  f x ="), "\n    ");
  assert.equal(enter("f x = do"), "\n  ");
  assert.equal(enter("g x = case x of"), "\n  ");
  assert.equal(enter("  a -> b"), "\n  ");
  assert.equal(enter("  a -> b -- then"), "\n  ");
  assert.equal(enter("f x = x + 1"), "\n");
  assert.equal(enter("f x = x\n  where y = 1"), "\n  ");
});

// --- L5: nothing outside PureScript's own module names PureScript ---------------------

test("seam rule: no file in src/ except languages/purescript.mjs names PureScript", () => {
  const dir = new URL("../src/", import.meta.url);
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(new URL(e.name + "/", d)) : files.push(new URL(e.name, d)); };
  walk(dir);
  const naming = files.filter((f) => /purescript/i.test(readFileSync(f, "utf8"))).map((f) => f.pathname.replace(dir.pathname, ""));
  assert.deepEqual(naming, ["languages/purescript.mjs"]);
});
