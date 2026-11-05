// The editor's language extension, in a Compartment of its own so switching
// Language swaps only that and nothing else in the editor (keymaps, theme,
// history and the document stay).
import { Compartment } from "@codemirror/state";

export function createMode(language) {
  const compartment = new Compartment();
  return {
    // Put this in the editor's extensions.
    extension: compartment.of(language.editorMode()),
    // The transaction effect that swaps in another Language's mode.
    switchTo: (other) => compartment.reconfigure(other.editorMode()),
  };
}
