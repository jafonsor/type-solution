#!/usr/bin/env bash
# Build the reflex-dom frontend to wasm and assemble dist/, doing what
# Obelisk v2's Obelisk.Setup.Frontend.Wasm hook does (lib/setup/src/Obelisk/
# Setup/Frontend/Wasm.hs @ 313f684b), without Obelisk or its Linux-only nix.
#
#   ./build.sh          # -O1 dev build
#   ./build.sh --prod   # -O2 + wasm-opt + wasm-tools strip, like Obelisk prod
set -euo pipefail
cd "$(dirname "$0")"

# ghc-wasm-meta at the revision Obelisk pins (deps/nix-haskell/pins/ghc-wasm-meta).
# Ships aarch64-darwin bindists. GHC_FLAVOUR=9_12 or 9_14 (Obelisk's default series).
GHC_FLAVOUR="${GHC_FLAVOUR:-9_14}"
export GHC_FLAVOUR
GHC_WASM_META="github:haskell-wasm/ghc-wasm-meta/5b96779e3d356b3962b6e9c85a9db3a1fcc31ed1#all_${GHC_FLAVOUR}"

if ! command -v wasm32-wasi-cabal >/dev/null; then
  exec nix shell "$GHC_WASM_META" --command "$0" "$@"
fi

prod=false
[[ "${1:-}" == "--prod" ]] && prod=true

if $prod; then opt=(-O2); else opt=(-O1); fi

[[ -d node_modules/@bjorn3/browser_wasi_shim ]] || npm install --no-audit --no-fund

wasm32-wasi-cabal update
wasm32-wasi-cabal build exe:frontend --builddir="dist-wasm-$GHC_FLAVOUR" "${opt[@]}"
# list-bin can also print git output from the source-repository checkouts; the path is the last line.
bin=$(wasm32-wasi-cabal list-bin exe:frontend --builddir="dist-wasm-$GHC_FLAVOUR" "${opt[@]}" | tail -n 1)

out=dist
rm -rf "$out"
mkdir -p "$out"
cp "$bin" "$out/frontend.wasm"
cp www/index.html www/all.js "$out/"

# JSFFI glue for `foreign import/export javascript`.
node "$(wasm32-wasi-ghc --print-libdir)/post-link.mjs" -i "$bin" -o "$out/ghc_wasm_jsffi.js"

# WASI polyfill; index.js is renamed to the name all.js imports.
for f in node_modules/@bjorn3/browser_wasi_shim/dist/*.js; do
  name=$(basename "$f")
  [[ "$name" == index.js ]] && name=wasi-shim.js
  cp "$f" "$out/$name"
done

if $prod; then
  wasm-opt -all -O2 "$out/frontend.wasm" -o "$out/frontend.wasm"
  wasm-tools strip -a "$out/frontend.wasm" -o "$out/frontend.wasm"
fi

ls -l "$out"
