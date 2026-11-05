# Nix packages for the PureScript compiler bundle (ticket 27).
#
# Everything is pinned: fetches are fixed-output (hashes), nothing reaches the
# network inside a build. Two derivations:
#
#   ghc-wasm-native  the gmp-free wasm GHC 9.14 (flavour perf+native_bignum),
#                    built from the haskell-wasm/ghc fork at a pinned commit.
#                    About 34 min on 10 cores; cached on its own.
#   purs-core-wasm   purs-core.wasm: pinned upstream purescript v0.15.16 plus
#                    nix/purescript/purescript.patch, built with that GHC.
#
# The GHC derivation reads no file of this repo except nix/ghc-wasm-native.nix
# itself (through the evaluator, not as a build input), so a change anywhere
# else (puzzles, frontend, ...) leaves its derivation path unchanged.
{ pkgs
# Source tree of haskell-wasm/ghc-wasm-meta (pinned by the nix-haskell pin):
# gives the wasi-sdk fork, the Node packages Template Haskell needs, cabal.
, ghcWasmMeta
}:

rec {
  ghc-wasm-native = import ./ghc-wasm-native.nix { inherit pkgs ghcWasmMeta; };

  purs-core-wasm = import ./purs-core.nix {
    inherit pkgs ghcWasmMeta;
    ghc = ghc-wasm-native;
  };
}
