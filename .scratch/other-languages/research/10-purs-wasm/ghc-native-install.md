# Installing the built native GHC (bindist -> prefix)

From `ghc/_build/bindist/ghc-9.14.1.20261012-wasm32-wasi`, with the wasi-sdk fork's tools exported as CC, CXX, AR, LD, NM, RANLIB, STRIP, OBJDUMP, OBJCOPY (the target compiler), and NOT the Mac's cc:

    ./configure --prefix=$PREFIX --build=aarch64-apple-darwin --host=aarch64-apple-darwin --target=wasm32-wasi
    make install RelocatableBuild=YES

Then use `$PREFIX/bin/wasm32-wasi-ghc` with `node` on PATH and `NODE_PATH` set to the ghc-wasm-npm-deps `node_modules` (needed for Template Haskell). Build the packages with `-optc-Wno-error=int-conversion` (clang 21 turns it into an error for `clock`).


## Use the script

[ghc-native-install.sh](ghc-native-install.sh) does the install above and exports the flag variables the bindist's `configure` turns into `lib/settings`: `CONF_CC_OPTS_STAGE2`, `CONF_CXX_OPTS_STAGE2` and `CONF_GCC_LINKER_OPTS_STAGE2`, with the values `ghc-wasm-meta` sets in its wasi-sdk setup hook. `ghc-native-build.sh` exports the same three for the build.

The link flags also need `-fuse-ld=<wasi-sdk>/bin/wasm-ld`, which the script adds. The bindist's `configure` only tries `-fuse-ld=lld`, so it never adds it. Without it clang picks a plain LLVM `wasm-ld` (from `llvm-binutils`) that lacks the haskell-wasm patch splitting `__wasm_apply_data_relocs`, and reflex-dom-core's Template Haskell fails to load its shared library ("size 10592929 > maximum function size 7654321").

Checked: the installed `settings` equals the nix bindist's apart from the order of `--target` and `-fuse-ld` and the `base unit-id` hash.
