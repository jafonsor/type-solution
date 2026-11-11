// The editor's language extension, in a Compartment of its own so switching
// Language swaps only that and nothing else in the editor (keymaps, theme,
// history and the document stay). The Language's import popup (seam 3, if it
// has import rules) is part of that extension: a Language without them
// gets no popup and Tab only indents.
import { Compartment } from "@codemirror/state";
import { importPopup } from "./import-popup.mjs";

// Everything a Language adds to the editor: its mode, and its import popup
// if it has import rules.
export function modeExtensions(language) {
  return [language.editorMode(), language.importRules ? importPopup(language.importRules) : []];
}

export function createMode(language) {
  const compartment = new Compartment();
  return {
    // Put this in the editor's extensions.
    extension: compartment.of(modeExtensions(language)),
    // The transaction effect that swaps in another Language's mode.
    switchTo: (other) => compartment.reconfigure(modeExtensions(other)),
  };
}
