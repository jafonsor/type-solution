Type: task
Status: ready-for-agent
Blocked by: none

# 27: Nix package for the `gmp`-free GHC and `purs-core.wasm`

## What to build

Build order step 3, first half. Write the derivation with every input pinned (closed box, no network), build it first in Docker as `linux/amd64` with CPU, memory and disk capped to the GitHub runner's, then confirm in a real GitHub Actions run that the roughly 34 min result is cached between runs. Output: `purs-core.wasm`, which ticket 21's `PURS_WASM` then points at.

## Acceptance

- `nix build` yields the wasm; a second CI run reuses the cached GHC.
- Decided in the grilling below; no open questions.

## Comments

Decisions (owner, 2026-11-05):

- **CI cache:** keep `magic-nix-cache-action` (already in `deploy.yml`). Move to Cachix only if the Actions cache evicts the GHC build in practice.
- **Caching check:** the second run must show the GHC derivation fetched from the cache, not built; and a change to an unrelated file (e.g. a puzzle) must leave the GHC derivation hash unchanged. Cache survival over days is only a note, not testable here.
- **If GHC fails under Docker/Rosetta:** skip to CI and iterate there on a throwaway branch with a dedicated `workflow_dispatch`-only workflow file, so Pages deploy is never triggered. No pause needed.
- **Docker caps:** the repo is public, so match the standard runner: 4 CPU, 16 GB RAM, about 14 GB free disk. Expect a cold build well over 34 min.
