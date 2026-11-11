Type: task
Status: ready-for-human
Blocked by: 31

# 33: One browser smoke test for the PureScript check

## What to build

Ticket 21 left this out on purpose: one small test driving a real browser worker (see `research/11-browser-worker/drive.mjs`) so the browser and Node checks cannot drift apart.

## Acceptance

- [x] Runs in a separate workflow (manual or on changes to the PureScript pieces), not in `deploy.yml`.
- [x] Compiles one fixed Puzzle's Reference Solution in the browser worker and checks it passes; also checks one type error and one syntax error produce a non-empty message.
- [x] The type-error message text is compared with puzzle-check's Node result, so drift between the two runners fails the test.
- [x] Running every Reference Solution in the browser is out of scope (too slow).

## Comments

Decisions (owner, 2026-11-05): separate workflow, assertions as above. Still blocked by 31, so it cannot be built until the browser worker exists.


## Built (local, 2026-11-11)

**Status is `ready-for-human`, not `resolved`:** everything below was run locally, but the workflow itself has never run in Actions (see "What the owner must do").

**Bug first: `firstError` in `tools/puzzle-check/purs-runner.js`.** It took the first `at` line of the whole text, so a Warning block printed before the Error was reported instead of it (for `queryString` plus a type error: the Solution's own `Field` warning). Now it reads only the first `Error` block, which ends at the next `Error`/`Warning` header or `RESULT:`; text with no Error block (a crash) is read whole as before. The browser's `errors.mjs` was already right. Tests that failed before and pass now: `warning-then-error.purs` (an unused-name warning before a type error) in `purs.test.js` ("a warning before a type error is not the one reported": old code gave `5:7 Name x was introduced but not used`, now `5:17 Could not match type String with type Int ...`), and in `browser-twin.test.js` a text-only test (no compiler) that gives the same compiler text to `firstError` and the browser's `compileError` and requires the same line, column and message, including a first block with no `See https://` link (the old code ran into the second block; the browser stops at the next header). Do the two agree on "first" in general? Now yes: both take the first Error block, skip Warnings, stop at the See link or the next header; both clean the same way (trim, join with a space, collapse spaces, 300 characters). Remaining known difference, by design: the position of a *syntax* error (the browser moves it to the end of the line before the break to underline the `+`; puzzle-check reports the compiler's), so the smoke test does not compare syntax positions. A second small one: the browser clamps a type error's position to the player's text, puzzle-check does not (only visible with a position past the end of a line, which the compiler does not print).

**Bundle hashes.** `nix build .#purs-bundle` before: `/nix/store/knxadzj...-purs-bundle-psc-0.15.16-20261104`; after the `purs-runner.js` change: `/nix/store/qlbif9pb...`. The store path changed because `purs-runner.js` is a text input of the derivation (inputs are hashed, not outputs), but `diff -r` of the two outputs is empty: same file names (which carry the content hashes), same `current.json`, same manifest, same bytes. So the deployed site's files do not change. After adding `passthru = { inherit libs; }` to `purs-bundle.nix` (below) the path stayed `qlbif9pb...`: passthru is not part of the derivation.

**The smoke test: `static/editor/browser/smoke-purescript.mjs`** (Chrome through playwright-core, `channel: "chrome"`; 7 checks, 29 s locally, of which about 24 s is puzzle-check's first compile of the libraries). On the exported site it:
1. pins the page's Puzzle to `clamp` (`Math.random` fixed to pick it; the bank is the sorted files of `puzzles/`; it checks the signature shown is `clamp`'s and fails with that message if the bank changes under it);
2. types `warning-then-error.purs` (a warning, then a type error) and compares the page with puzzle-check on the same text: **line, column and the cleaned first-error message** (the body up to the `See https://` link, one line, 300 characters). Why these three: they are exactly what `errors.mjs` and `firstError` both compute, so any drift in picking the first error, cleaning, or positions fails; the status line is "doesn't type-check yet: line L, column C: <message>", the wrapper is taken off with a regex and the three fields compared (puzzle-check's "compile error at L:C <message>" the same), not the sentence, so a change of wording in the wrapper does not fail it but a change of shape (the regex) does. The fixture's warning makes it also guard "which error is first";
3. types `syntax-error.purs`: non-empty message, "doesn't parse yet" shape, and the message equal to puzzle-check's (not the position, above);
4. types the Reference Solution of `clamp`: the status line reads "Passed in ...". Last, because a pass ends the Run.
The Node side is `purescriptProblems` from `purs-runner.js` (needs `PURS_WASM` and `PURS_LIBS`).

**The workflow: `.github/workflows/purescript-smoke.yml`.** Triggers: `workflow_dispatch`; `pull_request` and `push` to `main` with paths `static/editor/**`, `static/bundle/**`, `languages/purescript/**`, `tools/puzzle-check/**`, `tools/purs-bundle/**`, `tools/export-site.sh`, `purs-wasm.nix`, `purs-bundle.nix`, the workflow itself. `contents: read` only, nothing published, concurrency group per ref. Steps: checkout, Node 24, free disk space, Nix + magic-nix-cache (as `deploy.yml`), `nix build -L -o app`, `nix build -L .#purs-bundle -o purs-bundle`, `tools/export-site.sh app site /type-solution/ purs-bundle`, set `PURS_WASM` (`.#purs-core-wasm`) and `PURS_LIBS` (`.#purs-bundle.libs`), `npm ci --prefix tools/puzzle-check`, `npm install playwright-core@1.65.0` into `$RUNNER_TEMP/driver`, then `node static/editor/browser/smoke-purescript.mjs site`. Chrome is the runner image's Google Chrome. Cost: the app build is the bulk (the same derivations as the deploy, so the cache the deploy fills is reused; a cold run is as long as a cold deploy); the test itself is under a minute. Needed one Nix change: `purs-bundle.nix` got `passthru = { inherit libs; }` so `nix build .#purs-bundle.libs` gives the pinned library sources for puzzle-check (there was no way to get them in CI; no change to the bundle's output).

**Verified locally:** `actionlint` (via `nix run nixpkgs#actionlint`) reports nothing for the new workflow (and for `deploy.yml`); the exact driver command against a site exported with `tools/export-site.sh` from `nix build -o` of the app and bundle: 7/7. `nix build .#purs-bundle.libs` works.

**Broken on purpose** (all reverted): puzzle-check's cleaning changed (join with no space): the type-error comparison and the syntax message comparison failed, printing both sides. The old `firstError` restored: the type-error comparison failed (`5:7 Name x was introduced but not used` against `5:17 Could not match type...`), others passed. The browser's cleaning changed in a copy of the exported site (`slice(0,300)` to `slice(0,19)`): both comparisons failed. The Reference Solution broken (an unknown name): "the Reference Solution passes" failed, printing the status line (`doesn't type-check yet: line 6, column 13: Unknown value hi`).

**Unverified until a real Actions run:** the workflow end to end (checkout, `install-nix-action`, magic-nix-cache restore, the build times on a cold runner, `nix build .#purs-bundle.libs` on x86_64-linux, that the runner image still has Google Chrome for `channel: "chrome"` and that playwright-core 1.65.0 drives its version, that `$GITHUB_ENV` carries the two paths, that the path filters trigger as intended); Ubuntu's Chrome and font differences do not matter to the assertions (text only), but nothing was run on Linux.

**Gates:** `npm ci` and `npm run check --prefix tools/puzzle-check` OK (50 files; `puzzles/` untouched); `npm test --prefix tools/puzzle-check` 74 of 74 no skips (72 plus the two new); `npm test --prefix tools/purs-bundle` 37 of 37; `npm run solutions ... --lang=purescript` 50 of 50; `npm test --prefix static/editor` 134 of 134.

**Questions for the owner**
1. The triggers include `pull_request` as well as `push` to `main`; the ticket says "manual, and on changes to the PureScript pieces". A pull request run is where it is useful but costs a full Nix build each time; remove `pull_request` or keep it?
2. Path filters follow the list in the task. They do not cover `common/**` and `frontend/**`, where the status line wrapper ("doesn't type-check yet: line L, column C: ...") is written; a change there that breaks the shape would be caught only by the next run caused by another path. Add them (every UI change then runs the smoke test)?
3. The first check in the page is the `clamp` Puzzle pinned through `Math.random` (the page offers no way to choose a Puzzle). If the bank changes its order or size, the driver fails with a clear message rather than testing another Puzzle.
4. The syntax error's position is not compared (deliberate difference); say if you want the browser's adjusted position asserted too.

## What the owner must do

1. Run **PureScript smoke test** from the Actions tab (workflow_dispatch) on a test branch. Note the duration and that all 7 lines say PASS.
2. If it passes, set `Status: resolved`. If a step fails for a reason that is the workflow (not the test), report it: nothing in it has run in Actions yet.
