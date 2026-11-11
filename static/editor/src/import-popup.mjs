// The import popup, Language-agnostic: the one exception to "no suggestions or
// autocomplete" (spec L6). A Language with import rules (seam 3, see
// languages.mjs) gets this extension in its editor mode; one without gets
// nothing, and Tab indents as always.
//
// What the popup does, whatever the Language: after MIN_LETTERS letters it
// offers up to MAX_OFFERS names the Language's rules say can be imported,
// each with its module; Tab or Enter adds ONLY the import line (the typed
// letters are untouched, the player still types the whole name); Esc and a
// click elsewhere close it. The Language decides which names are offered and
// what the import edit is; this file knows nothing of any syntax.
//
// CodeMirror requirements, each verified in Chrome in ticket 17 (the build
// breaks without them):
//   - apply is a function dispatching only the import edit: one transaction,
//     one undo step, the cursor mapped through it, tagged
//     userEvent "input.complete" so a key recorder can tell it from typing;
//   - a highest-precedence Tab binding that runs acceptCompletion and
//     returns false when no popup is open, so indentWithTab takes the Tab;
//   - activateOnTypingDelay 0 and interactionDelay 0 (the defaults made an
//     early Tab indent instead of accepting);
//   - no validFor (it keeps offering a name already imported);
//   - closeCompletion(view) at the end of apply.
import { EditorView, keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { autocompletion, acceptCompletion, closeCompletion, completionStatus } from "@codemirror/autocomplete";

export const MIN_LETTERS = 2;
export const MAX_OFFERS = 6;
export const IMPORT_EVENT = "input.complete";

// The completion source for a Language's import rules:
//   rules.names()                          promise of the Language's name table
//   rules.isImportLine(lineText)           never offer on such a line
//   rules.offers(table, doc, word, limit)  [{name, module, ...}], best first, at most limit
//   rules.importEdit(doc, offer)           the one change (a CodeMirror ChangeSpec)
export function importSource(rules) {
  return async function source(context) {
    const word = context.matchBefore(/[A-Za-z_][\w']*/);
    if (!word || word.to - word.from < MIN_LETTERS) return null;
    if (rules.isImportLine(context.state.doc.lineAt(context.pos).text)) return null;
    let table;
    try { table = await rules.names(); } catch { return null; } // no table (yet): no popup
    if (!table) return null;
    const doc = context.state.doc.toString();
    const offers = rules.offers(table, doc, word.text, MAX_OFFERS);
    if (offers.length === 0) return null;
    return {
      from: word.from,
      filter: false, // the rules already chose and ordered; no validFor either
      options: offers.map((offer) => ({
        label: offer.name,
        detail: offer.module,
        apply(view) {
          view.dispatch({ changes: rules.importEdit(view.state.doc.toString(), offer), userEvent: IMPORT_EVENT });
          closeCompletion(view);
        },
      })),
    };
  };
}

// The popup's look follows the editor's colour variables, so it follows the
// page's light and dark schemes like the rest of the editor.
const popupTheme = EditorView.theme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--editor-bg)", color: "var(--editor-fg)",
    border: "1px solid var(--editor-gutter-fg)", borderRadius: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "inherit" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--editor-selection)", color: "var(--editor-fg)",
  },
  ".cm-completionDetail": { color: "var(--editor-gutter-fg)", marginLeft: "1em", fontStyle: "normal" },
});

// The editor extension for a Language's import rules.
export function importPopup(rules) {
  return [
    autocompletion({
      override: [importSource(rules)],
      activateOnTyping: true,
      activateOnTypingDelay: 0,
      interactionDelay: 0,
      icons: false,
    }),
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
    popupTheme,
  ];
}

// Is the popup open (so Esc, Tab and Enter belong to it)?
export function popupOpen(state) {
  return completionStatus(state) === "active";
}

// Does this key press accept the open popup? Then it is not typing: the
// import line it inserts is not a key press a Run counts.
export function acceptsPopup(key, status) {
  return status === "active" && (key === "Tab" || key === "Enter");
}

export { closeCompletion };
