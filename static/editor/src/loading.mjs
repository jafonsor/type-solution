// What the page shows while a Language's bundle downloads (spec, "Checks and
// errors": "Loading <Language> compiler…", a percentage if there is one, a
// failure with a retry). Language-agnostic: the trigger's start function
// reports here and the page reads it; nothing names a Language.
//
// A state is {state: "loading" | "ready" | "failed", percent}: percent is a
// whole number 0 to 100 while loading, -1 when there is none.
export function createLoadingStore() {
  const states = new Map();
  const listeners = new Set();
  const store = {
    set(name, state, percent = -1) {
      const previous = states.get(name);
      if (previous?.state === state && previous.percent === percent) return;
      states.set(name, { state, percent });
      for (const l of listeners) l(name, state, percent);
    },
    get: (name) => states.get(name) ?? { state: "idle", percent: -1 },
    // `listener(name, state, percent)` hears every change, and at once the
    // current state of every Language that has one (a download that began
    // before the page was watching). Returns a function that stops listening.
    watch(listener) {
      listeners.add(listener);
      for (const [name, { state, percent }] of states) listener(name, state, percent);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

// The trigger's `start(name)`: the Language's own download, reported to the
// store. A failure is reported and passed on (the trigger records it too).
export function reportingStart(store, languageNamed) {
  return async (name) => {
    store.set(name, "loading", 0);
    try {
      await languageNamed(name).bundle.start?.({ onProgress: (percent) => store.set(name, "loading", percent) });
      store.set(name, "ready");
    } catch (err) {
      store.set(name, "failed");
      throw err;
    }
  };
}
