// Keeping finished Runs in the browser's storage, apart from the editor so
// it can be tested in Node with a fake storage (test/storage.test.mjs).
//
// Runs live under one key as a JSON array of records (Common.Run's
// RunRecord). A record's key presses are its "keys" and "gaps" fields; the
// rest is its summary, which is never dropped.

export const runsKey = "type-solution.runs";

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
}

// Browsers name a full storage differently: QuotaExceededError (code 22) in
// most, NS_ERROR_DOM_QUOTA_REACHED (code 1014) in older Firefox.
function isQuotaError(err) {
  return err instanceof Error && (
    err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 || err.code === 1014);
}
