#!/bin/sh
# Build prototype-reflex-wasm's frontend with the self-built native GHC 9.14 only.
S=/private/tmp/claude-501/-Users-joaorodrigues-devs-type-solution/bec2a9c0-7633-4db5-b9a0-5016574b5e75/scratchpad
I=/Users/joaorodrigues/devs/ghc-wasm-native/inst2/bin
export PATH=$S/shim2:$I:/nix/store/k97vr1m45qyrr95v4cl92grjbbfsb04y-nodejs-26.10.0/bin:/nix/store/vx857gjkyzsdr3h1jrlx5gnbiwq0jbym-wasi-sdk/bin:$PATH
export NODE_PATH=/nix/store/1s7iy02afqrdkg3a2gx0vcayd5sk51j0-ghc-wasm-npm-deps-0.0.1/lib/node_modules/@haskell-wasm/ghc-wasm-npm-deps/node_modules
export CABAL_DIR=$HOME/.ghc-wasm/.cabal-native3
cd /Users/joaorodrigues/devs/type-solution/prototype-reflex-wasm
exec cabal --builddir=dist-native4 --with-compiler=$I/wasm32-wasi-ghc --with-hc-pkg=$I/wasm32-wasi-ghc-pkg --with-hsc2hs=$I/wasm32-wasi-hsc2hs "$@" -O1 -j4 exe:frontend
