## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Puzzle bank check

After adding or editing a file in `puzzles/`, run `npm ci --prefix tools/puzzle-check && npm run check --prefix tools/puzzle-check`. It must pass; it also prints the symbol coverage report. See `tools/puzzle-check/README.md`.
