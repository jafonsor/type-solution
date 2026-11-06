Type: task
Status: ready-for-agent
Blocked by: 27 (done); owner's go-ahead to tag, because a release is public

# 36: Publish the first `purs-wasm` release and fetch it here with a pinned hash

## What to build

The last piece of ticket 27's amended plan. [jafonsor/purs-wasm](https://github.com/jafonsor/purs-wasm) builds `purs-core.wasm` and a pruned `gmp`-free GHC in GitHub Actions (run 42136973924 passed; the release job was skipped because it only runs on a tag). Publish the first release and make this repo use the released wasm.

## Steps

1. **Check the artifact first.** Download the `release-assets` artifact of run 42136973924 (`gh run download 42136973924 --repo jafonsor/purs-wasm`), verify the `.sha256` files, run `PURS_WASM=<artifact>/purs-core.wasm PURS_LIBS=<pinned libs> npm run solutions --prefix tools/puzzle-check -- --lang=purescript` here (50 of 50), and read `BUILDINFO.json`.
2. **Tag.** Tag `v0.15.16-1` in `purs-wasm` on the commit that run built (or re-run on the tag if `main` moved); its `release` job publishes `purs-core.wasm`, `ghc-wasm-native-x86_64-linux.tar.xz`, their `.sha256` files and `BUILDINFO.json`.
3. **Fetch here.** Add a fixed-output derivation (`fetchurl` of the release URL with the asset's sha256) for `purs-core.wasm`, exposed in a way ticket 28 can take as an input without touching the app's default `nix build`. Document how to set `PURS_WASM` from it (README of `tools/puzzle-check`, ticket 21's notes) and how to bump it (new tag in `purs-wasm`, new hash here).
4. **Close ticket 27's last criterion** by pointing it at this ticket's commit.

## Acceptance

- The release exists with the four assets, and the hashes in this repo match the published files.
- `nix build` of the fetch derivation yields `purs-core.wasm`; the app's default `nix build` is unchanged.
- `PURS_WASM` pointing at it passes `npm run solutions` for PureScript (50 of 50) and `npm test --prefix tools/puzzle-check` with no skips.
- A short "bump the compiler" note exists where a dev will find it.

## Not covered here

A `LICENSE` file for `purs-wasm` (owner's choice), the library externs and Cache Storage (ticket 28), and the optional no-profiling GHC flavour experiment (not needed unless the GHC is rebuilt often).
