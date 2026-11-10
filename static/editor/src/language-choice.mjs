// Which Language the player is typing in, and each Language's draft. Pure
// rules, apart from the editor, so Node can test them (test/language-choice.test.mjs).
// Nothing here names a Language: the Languages come from the registry
// (languages.mjs), so adding one touches neither this module nor the dropdown.

// The one key this module owns (spec, "Saved data"). Read once, on page load.
export const languageKey = "type-solution.language";

// The saved choice: a name in `names`, else `fallback` (first visit, an
// unknown value, or storage that can't be read).
export function rememberedLanguage(storage, names, fallback) {
  try {
    const saved = storage.getItem(languageKey);
    return names.includes(saved) ? saved : fallback;
  } catch (err) {
    console.warn("Language not read:", err);
    return fallback;
  }
}

// Never throws: the choice just isn't remembered if storage can't be used.
export function rememberLanguage(storage, name) {
  try {
    storage.setItem(languageKey, name);
  } catch (err) {
    console.warn("Language not saved:", err);
  }
}

// Alt+L: the Language after `current`, wrapping round.
export function nextLanguage(names, current) {
  const at = names.indexOf(current);
  return names[(at + 1) % names.length];
}

// Each Language's draft for the Run under way. Values are opaque to the
// store (the editor keeps its whole state); a Language never touched has
// none, and opens empty. Memory only: a reload starts a fresh Run.
export function createDrafts() {
  const drafts = new Map();
  return {
    get: (name) => drafts.get(name),
    set: (name, draft) => { drafts.set(name, draft); },
    clear: () => { drafts.clear(); },
  };
}

// The current Language, its choice and its drafts.
//   names      the Languages, in the dropdown's order
//   fallback   the Language of a first visit
//   storage    localStorage (read once, here; written on every pick)
//   onPick     called with the name on every real pick (the bundle trigger)
// pick(name, current) takes the draft to keep for the Language being left
// and returns {name, draft} for the one picked (draft undefined: untouched,
// opens empty), or null when nothing changes (same or unknown Language).
export function createLanguageChoice({ names, fallback, storage, onPick = () => {} }) {
  const drafts = createDrafts();
  let current = rememberedLanguage(storage, names, fallback);

  function pick(name, leaving) {
    if (name === current || !names.includes(name)) return null;
    drafts.set(current, leaving);
    current = name;
    rememberLanguage(storage, name);
    onPick(name);
    return { name, draft: drafts.get(name) };
  }

  return {
    get current() { return current; },
    pick,
    cycle: (leaving) => pick(nextLanguage(names, current), leaving),
    next: () => nextLanguage(names, current),
    // A new Run: every draft goes.
    reset: () => drafts.clear(),
  };
}
