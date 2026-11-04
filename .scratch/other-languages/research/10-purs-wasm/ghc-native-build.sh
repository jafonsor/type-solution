#!/bin/sh
# Build GHC 9.14 wasm backend with the native (no gmp) bignum backend.
set -ex
export PATH=/nix/store/88zd46n0c3fbvlx48fkzilil99jf62n3-ghc-9.14.1/bin:$PATH
SDK=/nix/store/vx857gjkyzsdr3h1jrlx5gnbiwq0jbym-wasi-sdk
export AR=$SDK/bin/llvm-ar CC=$SDK/bin/wasm32-wasi-clang CC_FOR_BUILD=cc CXX=$SDK/bin/wasm32-wasi-clang++ \
  LD=$SDK/bin/wasm-ld NM=$SDK/bin/llvm-nm OBJCOPY=$SDK/bin/llvm-objcopy OBJDUMP=$SDK/bin/llvm-objdump \
  RANLIB=$SDK/bin/llvm-ranlib SIZE=$SDK/bin/llvm-size STRINGS=$SDK/bin/llvm-strings STRIP=$SDK/bin/llvm-strip
export CONF_CC_OPTS_STAGE2="-Wno-error=int-conversion -O3 -mcpu=lime1 -mreference-types -msimd128"
export CONF_CXX_OPTS_STAGE2="-fno-exceptions -Wno-error=int-conversion -O3 -mcpu=lime1 -mreference-types -msimd128"
export CONF_GCC_LINKER_OPTS_STAGE2="-Wl,--error-limit=0,--keep-section=ghc_wasm_jsffi,--keep-section=target_features,--stack-first,--strip-debug "
unset CONFIGURE_ARGS
cd ghc
GHC=/nix/store/88zd46n0c3fbvlx48fkzilil99jf62n3-ghc-9.14.1/bin/ghc ./configure --target=wasm32-wasi --with-system-libffi
hadrian/build -j4 --flavour=perf+native_bignum --docs=none binary-dist-dir
