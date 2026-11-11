## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Puzzle bank check

After adding or editing a file in `puzzles/`, run `npm ci --prefix tools/puzzle-check && npm run check --prefix tools/puzzle-check`. It must pass; it also prints the symbol coverage report. See `tools/puzzle-check/README.md`.

## Working in this repo

- Nix flake builds do not see untracked files: `git add -N <new file>` before `nix build`.
- `cabal build` regenerates `static/generated/src/Obelisk/Generated/Static.hs`; revert it, never commit it.
- PureScript checks need `PURS_WASM` (the released compiler: `nix build .#purs-core-wasm --no-link --print-out-paths`) and `PURS_LIBS` (the pinned library sources); `tools/puzzle-check/README.md` says how to get both and how to bump the compiler. The pinned `purs-core.wasm` hash is the one the `purs-wasm` Actions run printed, never a local rebuild's: a different GHC store path gives different wasm bytes.
- Pushing, tags, releases and workflow runs are the owner's. An agent's `gh api .../git/refs` is refused by the permission system; ask the owner, or have them add a permission rule.
- A test you break on purpose proves nothing until `git diff` shows the break applied: check the diff first, then read the result, then restore the file.
