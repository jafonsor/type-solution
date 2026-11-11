// Keeping finished Runs in the browser's storage, apart from the editor so
// it can be tested in Node with a fake storage (test/storage.test.mjs).
//
// Runs live under one key as a JSON array of records (Common.Run's
// RunRecord). A record's key presses are its "keys" and "gaps" fields, and
// "keyLanguages" (which Language each was typed in, present only for a Run
// that switched); the rest is its summary, which is never dropped: the
// "language" and "peeked" fields stay whatever happens. Nothing here names a
// Language, so stripping covers all of them alike. A record with no
// "language" is a JavaScript Run written before the field existed; it is
// stored as it is and never rewritten (Haskell reads the missing field as
// JavaScript, Common.Run's legacyLanguage).

export const runsKey = "type-solution.runs";

// The stored Runs as the JSON text storage holds, or "[]" when there are
// none or storage can't be read. Never throws. The text isn't checked here:
// Haskell (Common.History.decodeRecords) reads each record on its own and
// skips any it can't.
export function loadRuns(storage) {
  try {
    const text = storage.getItem(runsKey);
    return typeof text === "string" ? text : "[]";
  } catch (err) {
    console.warn("Runs not read:", err);
    return "[]";
  }
}

// Append the record to the Runs in storage. When storage is full, strip the
// key presses from the oldest records, one at a time, until the new record
// fits. Returns whether it was kept. Never throws: if storage can't be used
// at all, or the record doesn't fit even with every older record stripped,
// the Run just isn't kept and what was stored stays as it was.
export function saveRun(storage, record) {
  let runs;
  try {
    runs = JSON.parse(storage.getItem(runsKey) || "[]");
  } catch (err) {
    // Storage unavailable, or what's there isn't ours to overwrite.
    console.warn("Run not saved:", err);
    return false;
  }
  if (!Array.isArray(runs)) {
    console.warn("Run not saved: stored Runs aren't a list");
    return false;
  }
  runs.push(record);
  const older = runs.length - 1;
  for (let next = 0; ; ) {
    try {
      storage.setItem(runsKey, JSON.stringify(runs));
      return true;
    } catch (err) {
      while (next < older && !hasKeyPresses(runs[next])) next++;
      if (!isQuotaError(err) || next === older) {
        console.warn("Run not saved:", err);
        return false;
      }
      stripKeyPresses(runs[next]);
    }
  }
}

function hasKeyPresses(run) {
  return run !== null && typeof run === "object" && ("keys" in run || "gaps" in run);
}

function stripKeyPresses(run) {
  delete run.keys;
  delete run.gaps;
  delete run.keyLanguages;
}

// Browsers name a full storage differently: QuotaExceededError (code 22) in
// most, NS_ERROR_DOM_QUOTA_REACHED (code 1014) in older Firefox.
function isQuotaError(err) {
  return err instanceof Error && (
    err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 || err.code === 1014);
}

// --- Options (spec, "Saved data") ---------------------------------------------
//
// One key, a JSON object whose first field is `underlines` (the "Show error
// underlines" checkbox, on by default). A missing key, a value that isn't a
// JSON object, or a missing or non-boolean field takes the default. Saving a
// field keeps every other field it finds (an option a later version added),
// and writes `underlines` first.

export const optionsKey = "type-solution.options";
export const defaultOptions = { underlines: true };

function readOptionsObject(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(optionsKey));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {}; // nothing stored, not JSON, or storage that can't be read
  }
}

// The options in force: the defaults, with each stored field that has the
// right type. Never throws.
export function loadOptions(storage) {
  const stored = readOptionsObject(storage);
  return { underlines: typeof stored.underlines === "boolean" ? stored.underlines : defaultOptions.underlines };
}

// Store one option, keeping the fields we don't know. Never throws: the
// choice just isn't remembered if storage can't be used. Returns whether it was kept.
export function saveOption(storage, name, value) {
  const stored = readOptionsObject(storage);
  const merged = { underlines: defaultOptions.underlines, ...stored, [name]: value };
  // `underlines` first, whatever order the stored object had.
  const { underlines, ...rest } = merged;
  try {
    storage.setItem(optionsKey, JSON.stringify({ underlines, ...rest }));
    return true;
  } catch (err) {
    console.warn("Option not saved:", err);
    return false;
  }
}
