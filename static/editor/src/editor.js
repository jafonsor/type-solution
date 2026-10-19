// The editor shim: CodeMirror 6 behind a small global API, so the Reflex
// frontend only sees document text and keys. All editor behaviour lives
// here: highlighting and auto-indent, but no auto-closing brackets and no
// autocompletion (Tab indents, Enter starts a new line). Every colour is a
// CSS variable (static/src/css/app.css), so the editor follows the page's
// light and dark schemes.
//
//   const editor = TypeSolution.createEditor(parent, onChange, onEscape, onKey);
//     // onKey(key, time) gets each key press a Run counts, while the editor
//     // is editable: key is the character the browser typed, or " ", "\n",
//     // "\t" or "\b" for Space, Enter, Tab and Backspace (Common.Run's
//     // keyChar); time is the keydown event's timeStamp, in milliseconds.
//     // Other keys aren't reported.
//     // onEscape gets every Esc on the page, wherever the focus is (the
//     // menu's buttons included), so it works while the editor is read-only.
//   editor.setDoc(text);   // replace the document without calling onChange
//   editor.setReadOnly(b); // true: no typing and Tab moves focus; false: back
//   editor.focus();
//   TypeSolution.focus(element)     // focus a page element, e.g. a button
//   TypeSolution.random()           // Math.random(), a number in [0, 1)
//   TypeSolution.syntaxError(code)  // null, or the parser's message
//   TypeSolution.saveRun(json)      // append a finished Run to browser storage
//                                   // (storage.mjs: what happens when it's full)
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, Prec, Compartment } from "@codemirror/state";
import { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { tags as t } from "@lezer/highlight";
import * as acorn from "acorn";
import * as storage from "./storage.mjs";

const theme = EditorView.theme({
  "&": { color: "var(--editor-fg)", backgroundColor: "var(--editor-bg)" },
  ".cm-content": { caretColor: "var(--editor-cursor)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--editor-cursor)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "var(--editor-selection)" },
  ".cm-gutters": { color: "var(--editor-gutter-fg)", backgroundColor: "var(--editor-bg)", border: "none" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--editor-bracket)", outline: "none" },
  "&.cm-focused .cm-nonmatchingBracket": { color: "var(--bad)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syn-literal)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)], color: "var(--syn-function)" },
  { tag: [t.definition(t.variableName), t.propertyName], color: "var(--syn-name)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--syn-punctuation)" },
  { tag: t.invalid, color: "var(--bad)" },
]);

// The key press as a Run counts it (see createEditor's onKey), or null.
// It is what the browser typed, Shift and Option included, so "A" and "a"
// differ and the player's layout decides what each physical key is.
function keyOf(e) {
  // Shortcuts aren't typing. Option (and AltGr, which reports Ctrl+Alt)
  // types characters on many layouts, so it is.
  if (e.metaKey || (e.ctrlKey && !e.altKey)) return null;
  // A dead key ("Dead") or an input method ("Process", or anything while
  // composing) is half of a character: neither is reported, and the
  // character it makes is reported only if its own keydown isn't marked as
  // composing (browsers differ).
  if (e.isComposing || e.key === "Dead" || e.key === "Process") return null;
  if (e.key === "Enter") return "\n";
  if (e.key === "Tab") return "\t";
  if (e.key === "Backspace") return "\b";
  // One character (one code point, so an emoji counts too); names such as
  // "ArrowLeft" or "Shift" are longer.
  if ([...e.key].length === 1) return e.key;
  return null;
}

// Typing, and Tab indenting, only while the editor is editable. Read-only,
// the editor takes no input and leaves Tab to the browser, so focus can move
// to the menu's buttons.
function editing(on) {
  return on
    ? [keymap.of([indentWithTab])]
    : [EditorState.readOnly.of(true), EditorView.editable.of(false)];
}

function createEditor(parent, onChange, onEscape, onKey) {
  let programmatic = false;
  const mode = new Compartment();
  // Esc is caught for the whole page, before the editor sees it: once the
  // menu is open the focus is on its buttons, not in the editor.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      onEscape();
    }
  }, true);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        lineNumbers(), history(), drawSelection(), indentOnInput(), bracketMatching(),
        theme, syntaxHighlighting(highlight), javascript(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        mode.of(editing(true)),
        Prec.highest(EditorView.domEventHandlers({
          keydown(e, view) {
            // Esc belongs to the page's listener above.
            if (e.key === "Escape") return true;
            // Read-only (the menu is open), nothing is typing: Tab moves
            // the focus on.
            if (view.state.readOnly) return false;
            const key = keyOf(e);
            // timeStamp: when the key went down, on the page's monotonic
            // clock, so the time between presses is exact to well under a
            // millisecond however busy the page is afterwards.
            if (key !== null) onKey(key, e.timeStamp);
            return false;
          },
        })),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !programmatic) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
  view.focus();
  return {
    setDoc(text) {
      programmatic = true;
      try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }
      finally { programmatic = false; }
    },
    setReadOnly(readOnly) {
      view.dispatch({ effects: mode.reconfigure(editing(!readOnly)) });
    },
    focus() { view.focus(); },
  };
}

function syntaxError(code) {
  try {
    acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
    return null;
  } catch (err) {
    return err.message;
  }
}

// Finished Runs live in this browser only. Storage can be unavailable
// (private windows, blocked site data; even reading `localStorage` can
// throw) or full; the Run is then just not kept, and play goes on.
function saveRun(json) {
  try {
    storage.saveRun(localStorage, JSON.parse(json));
  } catch (err) {
    console.warn("Run not saved:", err);
  }
}

window.TypeSolution = {
  createEditor, syntaxError, saveRun,
  focus(element) { element.focus(); },
  random() { return Math.random(); },
};
