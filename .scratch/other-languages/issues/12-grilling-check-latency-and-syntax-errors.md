Type: grilling
Status: resolved
Blocked by: none

# 12: When does a PureScript check run, and how are its errors shown?

## Question

With the measured check times from [ticket 10](10-task-build-purs-wasm.md) and [ticket 11](11-task-purs-wasm-in-browser-worker.md): does PureScript keep the 400 ms edit pause, the 1 s timeout and the warm spare worker, or does it need its own cadence (for example check on demand or after a longer pause)? How are PureScript's structured errors (several, with ranges and codes) shown in the editor compared with acorn's single point for JavaScript? What does the player see while the compiler bundle is still loading?

## Answer

**Plain version: PureScript keeps the same rhythm as JavaScript (check 400 ms after the last edit), but the compiler lives in one long-lived worker, errors get optional underlines, and the player sees a loading line while the compiler downloads.**

**Cadence.**
- The 400 ms pause stays.
- One long-lived compiler worker for PureScript, kept between checks (killing it each time would lose the compiler's warm state). Each check still gets a fresh compiler instance inside it; the in-memory file tree persists.
- Compiling has its own timeout of about 5 s, a safety net that should almost never fire. The 1 s timeout applies only to running the generated JavaScript against the tests, in a fresh sandbox as today.
- A newer edit makes the older result ignored; a new check starts after the pause. The worker is only killed on a timeout, and a new one rebuilds its file tree from the saved downloads.
- No spare worker for PureScript.

**Cache.** The compiler's "disk" is an in-memory file tree in the worker (ticket 11). Library results (externs, compiled library JavaScript) are built at build time and shipped as hashed static files, saved by the browser (ticket 13). Compile results of the player's `Main` are not persisted; no OPFS (an option if the first check ever feels slow). An optional low-priority warm-up compile of the Puzzle's Reference Solution runs after the compiler loads and when a new Puzzle opens; a real check goes first and discards it. It matters mainly if the shipped library files fail to load and the compiler must build them (3.4 s cold).

**Errors.**
- Status line shows the first error only, as one cleaned line (colour codes and doc links stripped) with line and column: "doesn't parse yet" for syntax errors, "doesn't type-check yet" for type errors. Hovering the status line shows the full text of all errors.
- Editor underlines (squiggles) for both Languages, behind a menu option "Show error underlines", on by default, saved in `localStorage["type-solution.options"]`. JavaScript underlines acorn's point; PureScript underlines each reported range. They appear when a check finishes and disappear on the next edit. PureScript syntax errors report the line after the break, so the underline goes at the end of the last non-blank line before the reported position. The status-line message stays whether underlines are on or off.

**Loading.** The download starts on the first PureScript pick. The status line shows "Loading PureScript compiler…" (with a percentage if available); the player can type; the first check runs when loading finishes. If the download fails, the status line says so with a retry; switching to JavaScript always works.

**Run time.** Unchanged rule for both Languages: the time ends when the passing check's result arrives (`finishedAt`, [Run.hs](../../../common/src/Common/Run.hs)), so waiting for the compiler counts. Preloading keeps the extra wait small.
