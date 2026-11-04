#!/bin/sh
export PATH=/private/tmp/claude-501/-Users-joaorodrigues-devs-type-solution/bec2a9c0-7633-4db5-b9a0-5016574b5e75/scratchpad/shim2:/Users/joaorodrigues/devs/ghc-wasm-native/inst/bin:/nix/store/k97vr1m45qyrr95v4cl92grjbbfsb04y-nodejs-26.10.0/bin:/nix/store/vx857gjkyzsdr3h1jrlx5gnbiwq0jbym-wasi-sdk/bin:$PATH
export NODE_PATH=/nix/store/1s7iy02afqrdkg3a2gx0vcayd5sk51j0-ghc-wasm-npm-deps-0.0.1/lib/node_modules/@haskell-wasm/ghc-wasm-npm-deps/node_modules
exec cabal --builddir=dist-native --with-compiler=/Users/joaorodrigues/devs/ghc-wasm-native/inst/bin/wasm32-wasi-ghc --with-hc-pkg=/Users/joaorodrigues/devs/ghc-wasm-native/inst/bin/wasm32-wasi-ghc-pkg --with-hsc2hs=/Users/joaorodrigues/devs/ghc-wasm-native/inst/bin/wasm32-wasi-hsc2hs "$@"
