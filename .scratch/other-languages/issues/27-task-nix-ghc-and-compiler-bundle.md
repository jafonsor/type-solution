Type: task
Status: needs-info
Blocked by: none

# 27: Nix package for the `gmp`-free GHC and `purs-core.wasm`

## What to build

Build order step 3, first half. Write the derivation with every input pinned (closed box, no network), build it first in Docker as `linux/amd64` with CPU, memory and disk capped to the GitHub runner's, then confirm in a real GitHub Actions run that the roughly 34 min result is cached between runs. Output: `purs-core.wasm`, which ticket 21's `PURS_WASM` then points at.

## Acceptance

- `nix build` yields the wasm; a second CI run reuses the cached GHC.
- Needs-info: owner to confirm Docker/Rosetta plan and CI cache choice.
