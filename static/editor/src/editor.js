// The editor shim: CodeMirror 6 behind a small global API, so the Reflex
// frontend only sees document text and keys. All editor behaviour lives
// here: highlighting and auto-indent, but no auto-closing brackets and no
// autocompletion (Tab indents, Enter starts a new line). Every colour is a
// CSS variable (static/src/css/app.css), so the editor follows the page's
// light and dark schemes.
//
//   const editor = TypeSolution.createEditor(parent, onChange, onEscape, onKey);
//     // onKey gets "character", "space", "enter" or "backspace" for each
//     // such key press the player makes; other keys aren't reported.
//   editor.setDoc(text);   // replace the document without calling onChange
//   editor.focus();
//   TypeSolution.syntaxError(code)  // null, or the parser's message
//   TypeSolution.saveRun(json)      // append a finished Run to browser storage
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

// The kind of key press a Run counts, or null.
function keyKind(e) {
  // Shortcuts aren't typing. Option (and AltGr, which reports Ctrl+Alt)
  // types characters on many layouts, so it is.
  if (e.isComposing || e.metaKey || (e.ctrlKey && !e.altKey)) return null;
  if (e.key === " ") return "space";
  if (e.key === "Enter") return "enter";
  if (e.key === "Backspace") return "backspace";
  if (e.key.length === 1) return "character";
  return null;
}

function createEditor(parent, onChange, onEscape, onKey) {
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
            if (e.key === "Escape") {
              onEscape();
              return true;
            }
            const kind = keyKind(e);
            if (kind) onKey(kind);
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
// (private windows, blocked site data); the Run is then just not kept.
const runsKey = "type-solution.runs";

function saveRun(json) {
  try {
    const runs = JSON.parse(localStorage.getItem(runsKey) || "[]");
    runs.push(JSON.parse(json));
    localStorage.setItem(runsKey, JSON.stringify(runs));
  } catch (err) {
    console.warn("Run not saved:", err);
  }
}

window.TypeSolution = { createEditor, syntaxError, saveRun };
