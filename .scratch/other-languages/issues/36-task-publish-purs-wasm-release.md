Type: task
Status: resolved
Blocked by: 27 (done); owner's go-ahead to tag, because a release is public

# 36: Publish the first `purs-wasm` release and fetch it here with a pinned hash

## What to build

The last piece of ticket 27's amended plan. [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm) builds `purs-core.wasm` and a pruned `gmp`-free GHC in GitHub Actions (run 42136973924 passed; the release job was skipped because it only runs on a tag). Publish the first release and make this repo use the released wasm.

## Steps

1. **Check the artifact first.** Download the `release-assets` artifact of run 42136973924 (`gh run download 42136973924 --repo jafonsor/purs-wasm`), verify the `.sha256` files, run `PURS_WASM=<artifact>/purs-core.wasm PURS_LIBS=<pinned libs> npm run solutions --prefix tools/puzzle-check -- --lang=purescript` here (50 of 50), and read `BUILDINFO.json`.
2. **Tag.** Tag `v0.15.16-1` in `purs-wasm` on the commit that run built (or re-run on the tag if `main` moved); its `release` job publishes `purs-core.wasm`, `ghc-wasm-native-x86_64-linux.tar.xz`, their `.sha256` files and `BUILDINFO.json` (five files).
3. **Fetch here.** Add a fixed-output derivation (`fetchurl` of the release URL with the asset's sha256) for `purs-core.wasm`, exposed in a way ticket 28 can take as an input without touching the app's default `nix build`. Document how to set `PURS_WASM` from it (README of `tools/puzzle-check`, ticket 21's notes) and how to bump it (new tag in `purs-wasm`, new hash here).
4. **Close ticket 27's last criterion** by pointing it at this ticket's commit.

## Acceptance

- [x] The release exists with its assets (five files, not four: `purs-core.wasm`, `ghc-wasm-native-x86_64-linux.tar.xz`, their two `.sha256` files and `BUILDINFO.json`), and the hashes in this repo match the published files. Proof: `gh release view v0.15.16-1 --repo jafonsor/purs-wasm --json assets`; `gh release download` then `shasum -a 256 -c *.sha256`; `purs-wasm.nix` pins `95a037c8...` and `nix build .#purs-core-wasm` only succeeds if the download hashes to it.
- [x] `nix build .#purs-core-wasm` yields `purs-core.wasm` (sha256 `95a037c8...`); the app's default package is unchanged (`nix eval --raw .#packages.aarch64-darwin.default.drvPath` is `/nix/store/4dhmfi2wlwgpxydfvjcnn5fsarmkp4jw-server-exe.drv` before and after).
- [x] `PURS_WASM` pointing at it passes `npm run solutions --prefix tools/puzzle-check -- --lang=purescript` (50 of 50) and `npm test --prefix tools/puzzle-check` (68 pass, 0 skipped).
- [x] A short "Bumping the compiler" note exists in `tools/puzzle-check/README.md`, with how to set `PURS_WASM` from the derivation.

## Not covered here

A `LICENSE` file for `purs-wasm` (owner's choice), the library externs and Cache Storage (ticket 28), and the optional no-profiling GHC flavour experiment (not needed unless the GHC is rebuilt often).

## Comments

- Release: https://github.com/jafonsor/purs-wasm/releases/tag/v0.15.16-1, tag on commit `c24772de` (the commit of run 42136973924), built by Build run 42710986570 (build, test and release jobs passed). Assets: `purs-core.wasm` (23,585,103 bytes, sha256 `95a037c84301ab54791636f6ad9baf0f5af91f61bab86f491b0b8a8d70dd6ec9`), `ghc-wasm-native-x86_64-linux.tar.xz` (65,376,976 bytes, sha256 `0262a970...411d0`), the two `.sha256` files, `BUILDINFO.json`.
- **Which wasm hash.** `7e95c64d...` (ticket 27) is the Docker-built wasm; the GitHub Actions wasm is `95a037c8...`. Both are 23,585,103 bytes; they differ in bytes only because the GHC store path differs. Run 42136973924's artifact and the fresh tag build have the same `purs-core.wasm` (`cmp` identical); only `BUILDINFO.json` differs (the release adds `tag` and `workflowRun`).
- Step 1 was done before tagging: the artifact's `.sha256` files verified and 50 of 50 PureScript Solutions passed with it, using the 40 pinned libraries cloned at their pinned commits as `PURS_LIBS`.
- Fetch: `purs-wasm.nix` (a `fetchurl`), exposed as flake output `packages.<system>.purs-core-wasm`; the default package is untouched, so ticket 28 can take it as an input.
- Gates with the nix-built wasm: `npm run solutions ... --lang=purescript` 50 of 50; `npm test --prefix tools/puzzle-check` 68 pass, 0 skipped; `npm ci` and `npm run check` pass.
- Only the `aarch64-darwin` default derivation could be evaluated here (the `x86_64-linux` one needs a Linux builder); the flake change adds an attribute and does not touch `default`.
