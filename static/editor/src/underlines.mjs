// Error underlines (spec, "Checks and errors"): the ranges a finished check
// reported, drawn under the text. Optional (the "Show error underlines"
// option, on by default); they appear when a check finishes and disappear on
// the next edit. The status line's message does not depend on them.
//
// Language-agnostic: a Checker's result has a `range` (and `ranges`), and the
// page hands them in with the `setErrors` effect. No Language is named here.
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

// [{from, to}]: the ranges to underline now (replaces what was there).
export const setErrors = StateEffect.define();
// true or false: whether the underlines are drawn (the option).
export const setUnderlinesShown = StateEffect.define();

const mark = Decoration.mark({ class: "cm-error-underline" });

function decorations(doc, { errors, shown }) {
  if (!shown) return Decoration.none;
  const ranges = errors
    .map(({ from, to }) => ({ from: Math.max(0, from), to: Math.min(to, doc.length) }))
    .filter((r) => r.to > r.from)
    .map((r) => mark.range(r.from, r.to));
  return Decoration.set(ranges, true);
}

const field = StateField.define({
  create: () => ({ errors: [], shown: true }),
  update(value, tr) {
    let { errors, shown } = value;
    // Any edit clears them: the check was of text that is no longer there.
    if (tr.docChanged) errors = [];
    for (const e of tr.effects) {
      if (e.is(setErrors)) errors = e.value;
      if (e.is(setUnderlinesShown)) shown = e.value;
    }
    return errors === value.errors && shown === value.shown ? value : { errors, shown };
  },
  provide: (f) => EditorView.decorations.compute([f, "doc"], (state) => decorations(state.doc, state.field(f))),
});

export const underlines = () => [field];

// The ranges drawn in this state, for tests: [[from, to], ...].
export function drawn(state) {
  const out = [];
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === "function") continue;
    for (const it = set.iter(); it.value; it.next()) out.push([it.from, it.to]);
  }
  return out;
}
