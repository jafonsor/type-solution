Type: task
Status: ready-for-agent
Blocked by: none

# 27: Nix package for the `gmp`-free GHC and `purs-core.wasm`

## What to build

Build order step 3, first half. Write the derivation with every input pinned (closed box, no network), build it first in Docker as `linux/amd64` with CPU, memory and disk capped to the GitHub runner's, then confirm in a real GitHub Actions run that the roughly 34 min result is cached between runs. Output: `purs-core.wasm`, which ticket 21's `PURS_WASM` then points at.

## Acceptance

- [x] `nix build .#purs-core-wasm` yields `purs-core.wasm` (built in Docker `linux/amd64`, 4 CPU, 16 GB; 50 of 50 PureScript Reference Solutions pass `npm run solutions -- --lang=purescript` with it); the app's own `nix build` is unchanged.
- [x] The GHC derivation (`.#ghc-wasm-native`) is separate and its derivation path does not change when a Puzzle file changes.
- [ ] A second CI run reuses the cached GHC (OPEN: needs a real GitHub Actions run, see the steps below).
- Decided in the grilling below; no open questions.

## Comments

Decisions (owner, 2026-11-05):

- **CI cache:** keep `magic-nix-cache-action` (already in `deploy.yml`). Move to Cachix only if the Actions cache evicts the GHC build in practice.
- **Caching check:** the second run must show the GHC derivation fetched from the cache, not built; and a change to an unrelated file (e.g. a puzzle) must leave the GHC derivation hash unchanged. Cache survival over days is only a note, not testable here.
- **If GHC fails under Docker/Rosetta:** skip to CI and iterate there on a throwaway branch with a dedicated `workflow_dispatch`-only workflow file, so Pages deploy is never triggered. No pause needed.
- **Docker caps:** the repo is public, so match the standard runner: 4 CPU, 16 GB RAM, about 14 GB free disk. Expect a cold build well over 34 min.

Progress: done in Docker and on the Mac, one criterion open. New: `nix/` (`default.nix`, `ghc-wasm-native.nix`, `purs-core.nix`, `purescript/` with the patch moved here, `cheapskate.patch`, `hackage.json`, `purs-core-Main.hs`), flake attributes `.#ghc-wasm-native` and `.#purs-core-wasm` (not in `default`), and `.github/workflows/purs-wasm.yml` (`workflow_dispatch` only, never deploys). `languages/purescript/language.json` now points `compilerPatch` at `nix/purescript/purescript.patch`.

Measured (Docker Desktop, Rosetta, `--cpus=4 --memory=16g`, ~27 GB free after pruning Docker's build cache):
- GHC (hadrian `perf+native_bignum` plus bindist install): about 2 h 54 min cold (hadrian 2 h 37 min, install 15 min). Three runs were needed: the first two failed on a locale (`LANG=C.UTF-8`, fixed) and on the snapshot version taking today's date (`VERSION_DATE`, fixed), then node missing from the bindist's shebangs (`nodejs` in `nativeBuildInputs`, fixed).
- `purs-core.wasm`: 13 min on top. 23,585,103 bytes (2,274,724 brotli), no `gmp` symbols. Not byte-identical to ticket 14's Mac wasm (23,625,988 bytes): different GHC build, different tool versions (`happy` from nixpkgs, `cborg` at a pinned master commit).
- Second Docker run of the same attributes: 23 s, nothing built, same store paths.
- Disk: the GHC build tree is large; a 14 GB runner will not hold it. `deploy.yml`'s "Free disk space" step is needed in the new workflow too (it has it).

Steps for the owner to close the last criterion (needs GitHub, I cannot run it):
1. Push this branch, then on the Actions tab run the workflow "PureScript wasm" (`workflow_dispatch`) on it. First run: the summary says "GHC derivation ... BUILT"; expect well over 34 min, probably 1 to 2 h with 4 cores native.
2. Run it again with no change: the summary must say "FETCHED from the cache (not built)" and the log must show no `ghc-wasm-native>` build lines.
3. Change an unrelated file (for example append a space to a Puzzle `.toml`), push, run it a third time: the "derivation" line must be the same path as before (and still FETCHED).
4. If the first run fails or the cache does not keep it (magic-nix-cache evicts), the decision above says: iterate on a throwaway branch with this workflow; move to Cachix only if eviction is real. Tick the criterion and set `Status: resolved` only after step 2 and 3 pass.
