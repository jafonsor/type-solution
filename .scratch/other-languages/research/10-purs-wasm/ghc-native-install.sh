#!/bin/sh
# Install the native GHC 9.14 wasm bindist built by ghc-native-build.sh.
# Usage: ghc-native-install.sh PREFIX
# The bindist's configure writes lib/settings from CONF_*_STAGE2, so they must be
# exported here as well as in the build (the same values ghc-wasm-meta's
# wasi-sdk setup hook exports). Without them the installed GHC has plain flags
# and reflex-dom-core's Template Haskell fails to load its shared library.
set -ex
PREFIX=$1
SDK=/nix/store/vx857gjkyzsdr3h1jrlx5gnbiwq0jbym-wasi-sdk
export AR=$SDK/bin/llvm-ar CC=$SDK/bin/wasm32-wasi-clang CXX=$SDK/bin/wasm32-wasi-clang++ \
  LD=$SDK/bin/wasm-ld NM=$SDK/bin/llvm-nm OBJCOPY=$SDK/bin/llvm-objcopy OBJDUMP=$SDK/bin/llvm-objdump \
  RANLIB=$SDK/bin/llvm-ranlib SIZE=$SDK/bin/llvm-size STRINGS=$SDK/bin/llvm-strings STRIP=$SDK/bin/llvm-strip
export CONF_CC_OPTS_STAGE2="-Wno-error=int-conversion -O3 -mcpu=lime1 -mreference-types -msimd128"
export CONF_CXX_OPTS_STAGE2="-fno-exceptions -Wno-error=int-conversion -O3 -mcpu=lime1 -mreference-types -msimd128"
# -fuse-ld must name the wasi-sdk fork: without it clang picks a plain LLVM wasm-ld
# (from llvm-binutils) that lacks the patch splitting __wasm_apply_data_relocs.
export CONF_GCC_LINKER_OPTS_STAGE2="-fuse-ld=$SDK/bin/wasm-ld -Wl,--error-limit=0,--keep-section=ghc_wasm_jsffi,--keep-section=target_features,--stack-first,--strip-debug "
cd ~/devs/ghc-wasm-native/ghc/_build/bindist/ghc-9.14.1.20261012-wasm32-wasi
./configure --prefix="$PREFIX" --build=aarch64-apple-darwin --host=aarch64-apple-darwin --target=wasm32-wasi
make install RelocatableBuild=YES
