// The editor shim: CodeMirror 6 behind a small global API, so the Reflex
// frontend only sees document text and keys. All editor behaviour lives
// here: highlighting and auto-indent, but no auto-closing brackets and no
// autocompletion (Tab indents, Enter starts a new line). Every colour is a
// CSS variable (static/src/css/app.css), so the editor follows the page's
// light and dark schemes.
//
//   const editor = TypeSolution.createEditor(parent, onChange, onEscape);
//   editor.setDoc(text);   // replace the document without calling onChange
//   editor.focus();
//   TypeSolution.syntaxError(code)  // null, or the parser's message
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { tags as t } from "@lezer/highlight";
import * as acorn from "acorn";

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

function createEditor(parent, onChange, onEscape) {
  let programmatic = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        lineNumbers(), history(), drawSelection(), indentOnInput(), bracketMatching(),
        theme, syntaxHighlighting(highlight), javascript(),
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
