// The Languages a Solution can be typed in. A Language is a plain value with
// the four seams; the run and the editor take one as an argument and never
// look inside it, so adding a Language is adding a value here (and its
// languages/<name>/ folder), not a second code path.
//
//   {
//     name,            // "javascript": the key in the registry and in saved data
//     title,           // "JavaScript": shown to the player
//     folder,          // seam 4, the bank folder: "languages/<name>"
//     settings,        // per-Language limits: {runTimeoutMs, compileTimeoutMs, ...}
//     createChecker,   // seam 1: ({Worker, url}) => Checker
//     editorMode,      // seam 2: () => CodeMirror extension
//     importRules,     // seam 3, optional: absent means no import popup, and
//                      // nothing else is lost. Present, it is
//                      //   {names, isImportLine, offers, importEdit}
//                      // and import-popup.mjs builds the popup from it:
//                      //   names()                 promise of the Language's name
//                      //                           table (its own shape); the popup
//                      //                           offers nothing until it resolves
//                      //   isImportLine(text)      a line the popup never opens on
//                      //   offers(table, doc, word, limit)
//                      //                           [{name, module, ...}] best first, at
//                      //                           most limit, the Language's rules
//                      //                           applied (what is already imported
//                      //                           or needs no import is left out)
//                      //   importEdit(doc, offer)  the one change, a CodeMirror
//                      //                           ChangeSpec, that adds the import
//                      //                           (merged or a new line)
//     bundle,          // optional: {start({onProgress}) -> promise}, the Language's
//                      // lazy download (static/bundle/trigger.mjs decides when);
//                      // onProgress(percent) is optional to call, whole numbers
//                      // 0 to 100. The status line reads "Loading <title>
//                      // compiler…" while it runs, and a failure shows a retry;
//                      // a check made meanwhile waits for it (src/loading.mjs)
//     canWarmUp,       // optional: true when the Language's Checker has a warmUp
//                      // (below); the page then calls it, after load and when a
//                      // new Puzzle opens, only while this is the current
//                      // Language. Absent (JavaScript): the page does nothing.
//   }
//
// A Checker is {check(code, fn, tests), stop()} and may have
// warmUp(code, fn, tests): the Puzzle's Reference Solution, as a head start for
// the first real check (fetching what the Puzzle needs, say). It never
// replies, never shows anything, and must never make a real check slower than
// it would be without it: do nothing a real check would have to wait for.
// check returns a promise of
//   {status: "pass" | "fail" | "error", message, line, column, range?, results?}
// where results is [{pass, got}] (one per test) for pass and fail. An error
// has kind: "syntax" (doesn't parse), "type" (doesn't type-check), "timeout"
// (the check ran too long), "crash" (the runner or the Solution broke) or
// "stopped" (a newer check or stop() ended it; nobody wants this result).
// A "syntax" or "type" error also has, for the first error: message (one
// cleaned line, without the position), line and column (both counting from
// 1), range {from, to} (document offsets, at least one character); and
// ranges (every error's range, the first included) and all (every error in
// full, as text for the status line's hover). A Checker may keep long-lived
// state (a compiler worker, a spare); it owns its own timeouts, compile and run.
import { javascript } from "./languages/javascript.mjs";
import { purescript } from "./languages/purescript.mjs";

export const DEFAULT_LANGUAGE = "javascript";

const registry = new Map();

export function registerLanguage(language) {
  registry.set(language.name, language);
}

// The Language by name; an unknown or missing name gives the default.
export function languageNamed(name) {
  return registry.get(name) ?? registry.get(DEFAULT_LANGUAGE);
}

export function languageNames() {
  return [...registry.keys()];
}

// Every Language, in registration order (the dropdown's order).
export function languageList() {
  return [...registry.values()];
}

registerLanguage(javascript);
registerLanguage(purescript);
