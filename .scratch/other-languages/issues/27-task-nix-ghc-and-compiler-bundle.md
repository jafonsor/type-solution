Type: task
Status: resolved
Blocked by: none

# 27: The `gmp`-free GHC and `purs-core.wasm`: built in `purs-wasm`, shipped as a release

## What to build

Build order step 3, first half. Amended 2026-11-06 (owner): the compiler is not built in this repo's `nix build`. It is built in its own repository, [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm) (public), by a GitHub Actions workflow, and published as a GitHub Release asset. This repo fetches the released `purs-core.wasm` with `fetchurl` and a pinned hash; ticket 21's `PURS_WASM` points at it.

Why: the app's own build and `deploy.yml` then never compile GHC; a dev who only works on the app downloads 23 MB. A dev who changes the compiler or its patch builds in `purs-wasm`. The GHC is a dependency of that repo, not of this one. See [ADR 0003](../../../docs/adr/0003-a-static-deploy-with-a-lazy-loaded-compiler-bundle.md).

## Acceptance

- [x] The `gmp`-free wasm GHC and `purs-core.wasm` build from pinned inputs in a closed box (Docker `linux/amd64`, 4 CPU, 16 GB, then GitHub Actions). 50 of 50 PureScript Reference Solutions pass `npm run solutions -- --lang=purescript` with the Docker-built wasm.
- [x] The GHC derivation is separate and its derivation path does not change when a Puzzle file changes (proved before the move; `purs-wasm` has no Puzzle files at all).
- [x] A second CI run reuses the cached GHC: `purs-wasm` Actions run 42125872153 (BUILT, about 1 h for the GHC) and run 42136973924 (FETCHED, whole job 32 min), same derivation path `sbxn593szxbfyc55scs7p080kv302r2b-ghc-wasm-native-9.14.1.20261012.drv`.
- [x] The pruned GHC (about 84 MB as `tar.xz`, [research 12](../research/12-ghc-wasm-compression.md)) builds in CI; a smoke test compiles Template Haskell with it; `purs-core` built with the pruned GHC has the same bytes as with the full one (run 42136973924).
- [x] This repo's duplicate `nix/` folder, flake attributes and `purs-wasm.yml` workflow are removed; the spec, ADR 0003, the map and tickets 10, 13 and 25 point at `purs-wasm`.
- [x] The last piece, publishing the first release and fetching it here with a pinned hash, moved to [ticket 36](36-task-publish-purs-wasm-release.md) and is done there (commit "Ticket 36: publish the first purs-wasm release ...").

## Comments

Decisions (owner, 2026-11-05 and 2026-11-06):

- **CI cache:** `magic-nix-cache-action` in `purs-wasm`; Cachix only if the Actions cache evicts the GHC build in practice.
- **Docker caps:** match the standard runner (4 CPU, 16 GB RAM, about 14 GB free disk).
- **Release asset, not a rebuild in this repo (2026-11-06):** a build of the same inputs with a different GHC store path gives different wasm bytes, so the released file is the source of truth. The GHC is a dependency of `purs-wasm`; this repo needs only the wasm.
- **The app's `frontend.wasm`** keeps the `ghc-wasm-meta` bindist (with `gmp`), unchanged (ADR 0003). Unifying the two toolchains was considered and left alone: the two wasm files only meet through a worker and JSON.

Measured (all in `purs-wasm`):
- Docker Desktop with Rosetta (`--cpus=4 --memory=16g`): GHC about 2 h 54 min cold (hadrian 2 h 37 min, install 15 min), `purs-core.wasm` 13 min more. Three attempts were needed (locale `LANG=C.UTF-8`; `VERSION_DATE` for the snapshot version; `nodejs` in `nativeBuildInputs` for the bindist's shebangs).
- GitHub Actions `ubuntu-latest`: GHC about 1 h cold. Full install 3441 MB; pruned 652 MB (Mac install measured), `tar.xz` about 84 MB.
- `purs-core.wasm` from Docker: 23,585,103 bytes (2,274,724 brotli), no `gmp` symbols, sha256 `7e95c64d9b626c0c7b373f4bc8a7fa22b745fee49c6e85f2aa50836758232909`. It differs from ticket 14's Mac wasm (23,625,988 bytes) and from other rebuilds: ticket 14's "byte-identical" meant the compiler's output (externs and JavaScript), not the wasm.
- The Actions artifact of run 42136973924 is the wasm the first release should publish; check its sha256 against the file the run printed before tagging.

Next: [ticket 36](36-task-publish-purs-wasm-release.md) publishes the first release (confirm the release assets, tag `v0.15.16-1` in `purs-wasm`) and adds the `fetchurl` derivation. Ticket 28 builds on it.
