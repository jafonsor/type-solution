// The editor shim: CodeMirror 6 behind a small global API, so the Reflex
// frontend only sees document text and keys. All editor behaviour lives
// here: highlighting and auto-indent, but no auto-closing brackets and no
// autocompletion (Tab indents, Enter starts a new line). Every colour is a
// CSS variable (static/src/css/app.css), so the editor follows the page's
// light and dark schemes.
//
//   const editor = TypeSolution.createEditor(parent, onChange, onEscape, onKey, onCycle, language);
//     // language is a Language's name (languages.mjs; "javascript" if omitted
//     // or unknown): the editor's mode, i.e. colouring and indent rules.
//     // onCycle gets every Alt+L pressed in the editor (it isn't a key press
//     // a Run counts); the page answers with editor.setLanguage(editor.nextLanguage()).
//     // onKey(key, time) gets each key press a Run counts, while the editor
//     // is editable: key is the character the browser typed, or " ", "\n",
//     // "\t" or "\b" for Space, Enter, Tab and Backspace (Common.Run's
//     // keyChar); time is the keydown event's timeStamp, in milliseconds.
//     // Other keys aren't reported.
//     // onEscape gets every Esc on the page, wherever the focus is (the
//     // menu's buttons included), so it works while the editor is read-only.
//   editor.setDoc(text);   // replace the document without calling onChange
//   editor.setReadOnly(b); // true: no typing and Tab moves focus; false: back
//   editor.setLanguage(name); // pick a Language: keeps the current draft (text,
//                             // cursor, undo history) for the one left, shows
//                             // the picked one's (empty if untouched), remembers
//                             // the choice in this browser and starts that
//                             // Language's bundle download the first time.
//                             // Returns the document now shown (unchanged if
//                             // the name is the current or an unknown one, or the
//                             // editor is read-only: no Language switch then).
//   editor.nextLanguage();    // the name Alt+L would pick
//   editor.setErrors([[from, to], ...]); // underline a finished check's error
//                             // ranges (document offsets); an edit or a Language
//                             // switch clears them
//   editor.setUnderlines(on); // the "Show error underlines" option: saved in
//                             // localStorage["type-solution.options"], applied now
//   editor.underlines();      // the option as it is
//   editor.reset();           // a new Run: every draft goes, the document is empty
//   editor.focus();
//   TypeSolution.focus(element)     // focus a page element, e.g. a button
//   TypeSolution.random()           // Math.random(), a number in [0, 1)
//   TypeSolution.saveRun(json)      // append a finished Run to browser storage
//                                   // (storage.mjs: what happens when it's full)
//   TypeSolution.loadRuns()         // the stored Runs as JSON text, "[]" if none
//                                   // or storage can't be read; never throws
//   TypeSolution.watchLoading((name, state, percent) => ...)
//                                   // a Language's download: state "loading"
//                                   // (percent 0 to 100, or -1), "ready" or
//                                   // "failed"; told at once of what has begun
//   TypeSolution.retryLoading(name) // try a failed download again
//   TypeSolution.createChecker(url, language)
//                                   // the Language's Checker (languages.mjs;
//                                   // JavaScript if omitted or unknown), given
//                                   // the runner script's url;
//                                   // .start(request, onReply) runs a check
//                                   // (request: {code, fn, tests} as JSON
//                                   // text; onReply gets the result as JSON
//                                   // text: status, message, line, column,
//                                   // results; see languages.mjs), .stop() ends
//                                   // it. A check a newer one or stop() ended
//                                   // never replies.
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, Prec, Compartment } from "@codemirror/state";
import { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { tags as t } from "@lezer/highlight";
import * as storage from "./storage.mjs";
import { languageNamed, languageList, languageNames, registerLanguage, DEFAULT_LANGUAGE } from "./languages.mjs";
import { createCheckSession } from "./run-check.mjs";
import { createMode } from "./editor-mode.mjs";
import { popupOpen, acceptsPopup, closeCompletion } from "./import-popup.mjs";
import { completionStatus } from "@codemirror/autocomplete";
import { createLanguageChoice } from "./language-choice.mjs";
import { createBundleTrigger } from "../../bundle/trigger.mjs";
import { underlines, setErrors, setUnderlinesShown } from "./underlines.mjs";
import { createLoadingStore, reportingStart } from "./loading.mjs";

const theme = EditorView.theme({
  "&": { color: "var(--editor-fg)", backgroundColor: "var(--editor-bg)" },
  ".cm-content": { caretColor: "var(--editor-cursor)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--editor-cursor)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "var(--editor-selection)" },
  ".cm-gutters": { color: "var(--editor-gutter-fg)", backgroundColor: "var(--editor-bg)", border: "none" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--editor-bracket)", outline: "none" },
  "&.cm-focused .cm-nonmatchingBracket": { color: "var(--bad)" },
  ".cm-error-underline": { textDecoration: "underline wavy var(--bad)", textUnderlineOffset: "3px" },
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

// The browser's storage, or a stand-in that remembers nothing when the site's
// data is blocked (even reading `localStorage` can throw).
function browserStorage() {
  try { return localStorage; } catch { return { getItem: () => null, setItem: () => {} }; }
}

// The Language choice and the bundle trigger, made on first use (after every
// Language is registered) and shared: the remembered Language is read once.
// The loading store hears what each Language's download is doing (the status
// line shows it).
let choice = null;
let trigger = null;
const loading = createLoadingStore();
function languageChoice() {
  if (choice) return choice;
  trigger = createBundleTrigger({
    languages: languageList(),
    start: reportingStart(loading, languageNamed),
  });
  const storage = browserStorage();
  choice = createLanguageChoice({
    names: languageNames(), fallback: DEFAULT_LANGUAGE, storage, onPick: (name) => trigger.onPick(name),
  });
  trigger.onPageLoad(choice.current); // the remembered Language's bundle, if it has one
  return choice;
}

// The remembered Language's name, or JavaScript: what a page opens in.
function initialLanguage() { return languageChoice().current; }

function createEditor(parent, onChange, onEscape, onKey, onCycle) {
  let programmatic = false;
  const languages = languageChoice();
  const mode = new Compartment(); // editing or read-only
  const language = createMode(languageNamed(languages.current)); // the Language's mode
  let view = null; // the editor, made below
  // Esc is caught for the whole page, before the editor sees it: once the
  // menu is open the focus is on its buttons, not in the editor. With the
  // import popup open, Esc closes the popup and nothing else.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      if (view && popupOpen(view.state)) closeCompletion(view);
      else onEscape();
    }
  }, true);
  // A fresh state, empty: the document of a Language not yet typed in.
  const freshState = () => EditorState.create({
    doc: "",
    extensions: [
      // First, so it sees a key before the import popup's own keys act on it.
      Prec.highest(EditorView.domEventHandlers({
        keydown(e, view) {
          // Esc belongs to the page's listener above.
          if (e.key === "Escape") return true;
          // Read-only (the menu is open), nothing is typing: Tab moves
          // the focus on.
          if (view.state.readOnly) return false;
          // Alt+L (the physical L key: Option+L types a character on a Mac)
          // cycles the Languages; it is not typing.
          if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyL") {
            e.preventDefault();
            onCycle();
            return true;
          }
          const key = keyOf(e);
          // Tab or Enter that accepts the import popup is not typing: the
          // import line it inserts is not a key press a Run counts.
          if (acceptsPopup(e.key, completionStatus(view.state))) return false;
          // timeStamp: when the key went down, on the page's monotonic
          // clock, so the time between presses is exact to well under a
          // millisecond however busy the page is afterwards.
          if (key !== null) onKey(key, e.timeStamp);
          return false;
        },
      })),
      lineNumbers(), history(), drawSelection(), indentOnInput(), bracketMatching(),
      theme, syntaxHighlighting(highlight), language.extension, underlines(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      mode.of(editing(true)),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !programmatic) onChange(u.state.doc.toString());
      }),
    ],
  });
  let underlinesOn = storage.loadOptions(browserStorage()).underlines;
  // A state made or restored for the view has no errors and the option as it is now.
  const settled = (state) => state.update({ effects: [setErrors.of([]), setUnderlinesShown.of(underlinesOn)] }).state;
  view = new EditorView({ parent, state: settled(freshState()) });
  // The mode of the state about to be shown is swapped in with it (the
  // compartment is shared, so the extension is the only thing that differs).
  const stateFor = (name) => freshState().update({ effects: language.switchTo(languageNamed(name)) }).state;
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
    // Each Language's draft is a whole EditorState, so its cursor and undo
    // history come back with it and Ctrl+Z never reaches into another
    // Language's text.
    setLanguage(name) {
      if (!view.state.readOnly) {
        const picked = languages.pick(name, view.state);
        if (picked) {
          programmatic = true;
          try { view.setState(settled(picked.draft ?? stateFor(picked.name))); }
          finally { programmatic = false; }
          view.focus();
        }
      }
      return view.state.doc.toString();
    },
    nextLanguage: () => languages.next(),
    // Underline these ranges ([[from, to], ...], document offsets) under the
    // text: a finished check's errors. They go on the next edit and on a
    // Language switch; with the option off they are kept but not drawn.
    setErrors(ranges) {
      view.dispatch({ effects: setErrors.of(ranges.map(([from, to]) => ({ from, to }))) });
    },
    // The "Show error underlines" option: saved (type-solution.options) and
    // applied at once.
    setUnderlines(on) {
      underlinesOn = !!on;
      storage.saveOption(browserStorage(), "underlines", underlinesOn);
      view.dispatch({ effects: setUnderlinesShown.of(underlinesOn) });
    },
    underlines: () => underlinesOn,
    reset() {
      languages.reset();
      programmatic = true;
      try { view.setState(settled(stateFor(languages.current))); }
      finally { programmatic = false; }
    },
    focus() { view.focus(); },
  };
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

// Reading `localStorage` itself can throw, so it's inside the try.
function loadRuns() {
  try {
    return storage.loadRuns(localStorage);
  } catch (err) {
    console.warn("Runs not read:", err);
    return "[]";
  }
}

window.TypeSolution = {
  createEditor, saveRun, loadRuns, initialLanguage,
  // [[name, title], ...]: the Languages in the dropdown's order.
  languages() { return languageList().map((l) => [l.name, l.title]); },
  registerLanguage,
  // What the status line shows of a Language's download:
  // watchLoading((name, state, percent) => ...) hears every change and first
  // what has already happened; state is "loading", "ready" or "failed",
  // percent a whole number while loading, -1 when there is none.
  watchLoading(listener) { languageChoice(); loading.watch(listener); },
  // Try a failed download again.
  retryLoading(name) { languageChoice(); trigger.retry(name)?.catch(() => {}); },
  createChecker(url, languageName) {
    return createCheckSession(languageNamed(languageName), { Worker, url });
  },
  focus(element) { element.focus(); },
  random() { return Math.random(); },
};
