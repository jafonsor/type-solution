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
//     importRules,     // seam 3, optional: absent means no import popup
//   }
//
// A Checker is {check(code, fn, tests), stop()}. check returns a promise of
//   {status: "pass" | "fail" | "error", message, line, column, range?, results?}
// where results is [{pass, got}] (one per test) for pass and fail, and range
// is {from, to} document offsets. An error also has kind: "syntax" (doesn't
// parse or type-check), "timeout" (the check ran too long), "crash" (the
// runner or the Solution broke) or "stopped" (a newer check or stop() ended
// it; nobody wants this result). A Checker may keep long-lived state (a
// compiler worker, a spare); it owns its own timeouts, compile and run.
import { javascript } from "./languages/javascript.mjs";

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

registerLanguage(javascript);
