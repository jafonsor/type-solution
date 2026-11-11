// The error underlines as editor state: they appear when told, disappear on the
// next edit, and the option turns them off without losing them. No browser.
// Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { underlines, setErrors, setUnderlinesShown, drawn } from "../src/underlines.mjs";

const start = (doc = "f x = x +\n\ng = 1\n") => EditorState.create({ doc, extensions: [underlines()] });
const range = (from, to) => ({ from, to });

test("none at first; a finished check's ranges are drawn, every one", () => {
  let s = start();
  assert.deepEqual(drawn(s), []);
  s = s.update({ effects: setErrors.of([range(8, 9), range(12, 15)]) }).state;
  assert.deepEqual(drawn(s), [[8, 9], [12, 15]]);
});

test("they disappear on the next edit, wherever it is", () => {
  let s = start().update({ effects: setErrors.of([range(8, 9)]) }).state;
  s = s.update({ changes: { from: 0, insert: "x" } }).state;
  assert.deepEqual(drawn(s), []);
  // ... and a selection change or no-op transaction does not clear them
  let t = start().update({ effects: setErrors.of([range(8, 9)]) }).state;
  t = t.update({ selection: { anchor: 3 } }).state;
  assert.deepEqual(drawn(t), [[8, 9]]);
});

test("with the option off nothing is drawn; turning it on again shows the same ranges", () => {
  let s = start().update({ effects: setErrors.of([range(8, 9)]) }).state;
  s = s.update({ effects: setUnderlinesShown.of(false) }).state;
  assert.deepEqual(drawn(s), []);
  s = s.update({ effects: setUnderlinesShown.of(true) }).state;
  assert.deepEqual(drawn(s), [[8, 9]]);
  // errors that arrive while it is off appear when it is turned on
  let t = start().update({ effects: setUnderlinesShown.of(false) }).state;
  t = t.update({ effects: setErrors.of([range(0, 1)]) }).state;
  assert.deepEqual(drawn(t), []);
  assert.deepEqual(drawn(t.update({ effects: setUnderlinesShown.of(true) }).state), [[0, 1]]);
});

test("a range beyond the text is cut to it, an empty one is dropped", () => {
  const s = start("abc").update({ effects: setErrors.of([range(1, 99), range(2, 2), range(5, 9)]) }).state;
  assert.deepEqual(drawn(s), [[1, 3]]);
});
