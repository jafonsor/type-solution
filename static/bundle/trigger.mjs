// When a Language's bundle is downloaded. Language-agnostic: a Language that has
// a downloadable bundle says so (`bundle: {...}` on its value, see
// static/editor/src/languages.mjs); one without (JavaScript) never triggers a
// download, so players who only use it pay nothing.
//
// The rule (spec, "Download timing"):
//   - the first pick of a Language that has a bundle starts its download;
//   - at page load, the remembered Language's bundle starts if it has one;
//   - nothing else does: not loading the page with another Language, not
//     picking a Language without a bundle, not picking one already loading.
//     Alt+L cycling is a series of picks, so it follows the same rule.

// The Language whose bundle an event starts, or null.
export function bundleToStart(languages, name) {
  const language = languages.find((l) => l.name === name);
  return language?.bundle ? language.name : null;
}

// `start(name)` begins the download and returns a promise; it is called at most
// once per Language until it fails, after which the next pick (or retry) calls
// it again. Returns {onPageLoad, onPick, retry, status}.
export function createBundleTrigger({ languages, start }) {
  const state = new Map(); // name -> {status: "loading"|"ready"|"failed", promise, error}

  function begin(name) {
    const current = state.get(name);
    if (current && current.status !== "failed") return current.promise;
    const entry = { status: "loading", promise: null, error: null };
    state.set(name, entry);
    entry.promise = (async () => start(name))() // starts now, not a tick later
      .then(
        (value) => { entry.status = "ready"; return value; },
        (error) => { entry.status = "failed"; entry.error = error; throw error; },
      );
    entry.promise.catch(() => {}); // the caller reads the failure through status
    return entry.promise;
  }

  const trigger = (name) => {
    const target = bundleToStart(languages, name);
    return target ? begin(target) : null;
  };

  return {
    // `remembered` is the saved Language name (any value; unknown ones start nothing).
    onPageLoad: trigger,
    onPick: trigger,
    retry: trigger,
    status: (name) => state.get(name)?.status ?? "idle",
  };
}
