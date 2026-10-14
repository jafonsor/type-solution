// The editor shim: CodeMirror 6 behind a small global API, so the Reflex
// frontend only sees document text and keys. All editor behaviour lives
// here: highlighting and auto-indent, but no auto-closing brackets and no
// autocompletion (Tab indents, Enter starts a new line).
//
//   const editor = TypeSolution.createEditor(parent, onChange, onEscape);
//   editor.setDoc(text);   // replace the document without calling onChange
//   editor.focus();
//   TypeSolution.syntaxError(code)  // null, or the parser's message
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import * as acorn from "acorn";

function createEditor(parent, onChange, onEscape) {
  let programmatic = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        lineNumbers(), history(), drawSelection(), indentOnInput(), bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle), javascript(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        Prec.highest(EditorView.domEventHandlers({
          keydown(e) {
            if (e.key !== "Escape") return false;
            onEscape();
            return true;
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

window.TypeSolution = { createEditor, syntaxError };
