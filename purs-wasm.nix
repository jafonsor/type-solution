# The released PureScript compiler, fetched (not built here). It is built in
# https://github.com/jafonsor/purs-wasm and published as a GitHub Release asset.
# To bump it: tag a new release there, then change `tag` and `sha256` below
# (see "Bumping the compiler" in tools/puzzle-check/README.md).
# (Editing any .nix file changes the CI Nix-store cache key; see ticket 40.)
{ fetchurl }:

let
  tag = "v0.15.16-1";
  sha256 = "95a037c84301ab54791636f6ad9baf0f5af91f61bab86f491b0b8a8d70dd6ec9";
in
fetchurl {
  name = "purs-core.wasm";
  url = "https://github.com/jafonsor/purs-wasm/releases/download/${tag}/purs-core.wasm";
  inherit sha256;
}
