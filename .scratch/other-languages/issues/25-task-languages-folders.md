Type: task
Status: ready-for-agent
Blocked by: 22

# 25: `languages/<name>/` folders and puzzle-check reading them

## What to build

Bank section of the spec. Create `languages/javascript/` and `languages/purescript/`: length limits, symbol list, compile timeout, calling-convention notes, and for PureScript the pinned package list (one package-set release), the compiler patch reference, the name-clash preference list and `authoring.md`. puzzle-check reads these folders (limits, symbols, per-Language coverage table, the pinned list instead of `PURS_LIBS`), lints prompts for Language-specific call syntax, and checks every symbol is in the name table. Update the `write-puzzle` skill: shared core plus an instruction to read each Language's folder; move the Language-specific rules out.

## Acceptance

- Adding a third Language folder needs no change to the skill or the check.
- puzzle-check fails a Solution that imports a library off the pinned list, from the committed file, without environment variables for the list (`PURS_WASM` stays).
