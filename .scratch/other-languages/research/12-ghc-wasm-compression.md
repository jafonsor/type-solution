# How small can the gmp-free wasm GHC install get? (ticket 27 follow-up)

## Question

`nix/ghc-wasm-native.nix` builds a GHC 9.14 wasm cross compiler, about 3.4 GB installed, 3 h to build. The owner wants to ship it to developers (GitHub Release asset, 2 GB per file, or a Nix binary cache) so they can rebuild `purs-core.wasm` without the 3 h build. What makes it much smaller, by how much, and what is the best recipe?

## Short answer

- Compression alone is enough. The whole unpruned install, tarred, is 868 MB with `gzip -9` and 490 MB with `xz -9e -T4`. Both are far under 2 GB as a single file. No splitting is needed.
- Pruning four things the purs-core build does not use takes the install from 4116 MB to 663 MB (-84%) and the `xz -9e` tarball to 84 MB. The `purs-core.wasm` built with the pruned install has the same sha256 as the one built with the full install.
- Nearly all the size is profiling libraries (51%), the `ghc` library and its docs tooling (about 25% more), and duplicate host binaries (11%).

## What was measured, and on what

There is no x86_64-linux output on this Mac, and no GHC in any Docker volume (96 volumes, none from this repo; images are only node/postgres/redis). `nix path-info` shows no `ghc-wasm-native` store path. So I measured the **aarch64-darwin** install from ticket 14: `~/devs/ghc-wasm-native/inst` (made by `ghc-native-install.sh`, same GHC commit and flavour `perf+native_bignum` as the Nix derivation). It differs from the Nix x86_64-linux output in these ways:

- Host executables (`ghc`, `ghc-pkg`, `hsc2hs`, `haddock`) are Mach-O arm64, not ELF.
- The Nix output wraps `wasm32-wasi-ghc` with `wrapProgram`; this install has plain copies.
- The wasm libraries (`.a`, `.so`, `.hi`) are wasm and should be the same kind of files, but I did not compare bytes with a Linux build.
- This install is 4116 MB (sum of file sizes; `du` says 3.9 G) against the 3.4 GB reported for the Linux output. I could not reconcile the 0.7 GB; it is probably the host binaries and the missing wrapper layout.

Tools: xz 5.8.3, zstd 1.5.7, brotli 1.1.0, gzip, macOS bsdtar, 10 cores, 32 GB RAM. `llvm-objcopy` and `llvm-strip` from the wasi-sdk; `wasm-opt`, `wasm-strip` are not installed.

"Builds" below means a complete `cabal build exe:purs-core` of purescript 0.15.16 plus patch, with 118 Hackage packages, in a fresh `CABAL_DIR` (no reused store), using the same steps as `nix/purs-core.nix` run outside Nix (`PATH` with the install's `bin`, node, wasi-sdk; `NODE_PATH` the npm-deps). Each build took 7 min on this Mac. I did not use `fs_usage` (needs sudo); what the build touches was found by deleting and rebuilding.

## Where the 4116 MB is

| Part | MB | Share |
|---|---|---|
| `.a` static libs (92 files): vanilla 594, profiling (`_p`) 1204, rts debug 8 | 1806 | 44% |
| `.so` wasm shared libs (96 files; half are `_p`) | 1147 | 28% |
| host executables `bin/` (each exists twice: `ghc`, `ghc-pkg`, `haddock`, `hsc2hs`, `hp2ps`, `unlit` and their `-9.14.1.20261012` copies, real copies, not links) | 864 | 21% |
| `.hi`, `.dyn_hi`, `.p_hi`, `.p_dyn_hi` (2229 each) | 276 | 7% |
| html/doc/latex, `.conf`, headers, js | under 2 | 0% |

Biggest single files: `libHSghc_p.a` 700 MB, `libHSghc.a` 356 MB, the `ghc-internal` and `Cabal` profiling `.a` 100 MB each, `ghc` and `haddock` host binaries 184 and 188 MB (twice each). `shasum` over all files finds 118 duplicate files worth 446 MB, nearly all the doubled binaries.

## Reductions, each measured on a fresh copy of the full install

| Reduction | Saves MB | % of 4116 | Safe for purs-core? |
|---|---|---|---|
| Drop profiling: `*_p.a`, `*_p-ghc*.so`, `*.p_hi`, `*.p_dyn_hi`, `*_debug*` rts | 2091 | 50.8 | Yes, built |
| Drop the `ghc`, `ghc-toolchain`, `hpc` packages (library dirs, `.so`, `.conf`; then `ghc-pkg recache`) | 1893 (1250 after profiling is gone) | 46.0 | Yes, built |
| Drop `haddock` binaries and the `haddock-api`, `haddock-library`, `xhtml` packages | 471 | 11.4 | Yes, built |
| Make the unversioned binaries symlinks to the versioned ones (dedupe) | 442 | 10.7 | Yes, built (ghc, ghc-pkg, hsc2hs used through symlinks) |
| Remove the wasm `name` section from every `.so` (`llvm-objcopy --remove-section=name`) | 115 | 2.8 | Built; saves only 3 MB once compressed, skip |
| Drop `lib/html`, `lib/doc`, `lib/latex` | 0.6 | 0.0 | Yes, built |
| Drop `.dyn_hi` | 69 | 1.7 | **No: breaks the build** |
| Drop all `.so` | 1147 | | **No: breaks Template Haskell** |
| `strip -x` on the Mach-O `ghc` | 27 of 184 | | Not applied. Linux ELF not measured |

Cumulative, in the order dropped:

| Variant | Contents | MB | vs full | Built purs-core.wasm |
|---|---|---|---|---|
| full | the install as is | 4116 | | 23,516,000 bytes, sha256 `55c0cb4d...` |
| v1 | no docs, no profiling | 2024 | -51% | not built |
| v2 | v1 + no haddock, dedupe | 1361 | -67% | not built |
| v3 | v2 + no `ghc`/`ghc-toolchain`/`hpc` packages | 683 | -83% | not built (v4 differs only by the `name` strip) |
| **v4** | v3 + `name` sections stripped | **663** | **-84%** | **same sha256 as full** |

v4 breakdown: `bin/` 255 MB (ghc 184, ghc-pkg 43, hsc2hs 28), `.a` 217, `.so` 129, `.hi` 30, `.dyn_hi` 30. The host executables are now 38% of it.

Two failures, both seen directly:

- With `.dyn_hi` removed, cabal fails on the first package: `Failed to load dynamic interface file for Prelude ... Prelude.dyn_hi: does not exist`. The build uses `shared: True`, so GHC reads `.dyn_hi`.
- With all `.so` removed, a one-line Template Haskell program (`$( [| 1 + 2 |] )`) fails with `user error (Pattern match failure in 'do' block at compiler/GHC/Runtime/Interpreter/Wasm.hs:46:3-19)`; with the `.so` it links. purescript uses Template Haskell, so the `.so` stay.

Two things I got wrong first and that matter: removing `Cabal` and `Cabal-syntax` makes cabal's solver fail ("goals I've had most trouble fulfilling: purescript, Cabal"), because purescript depends on the `Cabal` library. They stay (111 MB uncompressed, in v4). And `ghc-heap` and `ghc-platform` must stay: `ghci` and `ghc-boot` depend on them (`ghc-pkg check` reports them broken otherwise).

## Compression

Input is `tar -cf` of the directory (symlinks kept). Times are wall clock on this Mac; "mem" is peak RSS from `/usr/bin/time -l`. Decompress times marked * include a `cmp` against the original through a pipe, so they are upper bounds; the others are decompression to `/dev/null`.

| Input | Tool | Size MB | % of tar | Compress | Compress mem | Decompress | Decompress mem |
|---|---|---|---|---|---|---|---|
| full 4142 MB | `gzip -9` | 868.3 | 20.9 | 370 s | 7 MB | 151 s* | 7 MB |
| full | `xz -9e -T4` | 490.4 | 11.8 | 559 s | 3574 MB | 147 s* (`-T4`) | 1907 MB |
| full | `zstd -19 --long=31 -T4` | 504.3 | 12.1 | 366 s | 3062 MB | 145 s* | 1998 MB |
| v4 671 MB | `gzip -9` | 144.9 | 21.6 | 63 s | 7 MB | 23 s* | 7 MB |
| v4 | `zstd -3` | 133.3 | 19.9 | seconds | small | 0.5 s | 6 MB |
| v4 | `zstd -19 --long=31 -T4` | 97.6 | 14.6 | not timed alone | | 0.7 s | 644 MB |
| v4 | `zstd --ultra -22 --long=31 -T1` | 95.9 | 14.3 | 362 s | 2345 MB | 0.67 s | 644 MB |
| v4 | `brotli -q 11 --large_window=30` | 84.9 | 12.6 | 1472 s | 3837 MB | 26 s* | 1654 MB |
| v4 | `xz -9e -T1` | **83.9** | 12.5 | 313 s | 675 MB | 5.3 s | 66 MB |
| v4 | `xz -9e -T4` | 84.6 | 12.6 | 105 s | 3379 MB | not timed | |
| v3 | `gzip -9` | 147.9 | 21.4 | 66 s | 7 MB | 25 s* | 7 MB |

Takeaways: xz beats zstd and ties brotli on this data (wasm and `.hi` files compress about 8:1), at a fraction of brotli's time. `--long=31` makes zstd decompression need 644 MB of RAM. gzip is the only tool every machine has, and its result is already under the limit.

Not done: a Nix NAR (`nix-store --dump | zstd`), because no store path of this derivation exists on this machine. A NAR is the same bytes as the tar plus metadata, so expect the same figures. Nix binary caches compress NARs with xz or zstd themselves, so the cache needs the prune only if you want the cache entry itself small.

## Recommended recipe

For a single file under 2 GB, simple and safe: prune, tar, `xz`. About 84 MB.

```sh
# GHC = the install (a writable copy of the derivation output)
cd "$GHC"
rm -rf lib/html lib/doc lib/latex doc
# profiling and debug-rts variants
find . \( -name '*_p.a' -o -name '*_p-ghc*.so' -o -name '*.p_hi' -o -name '*.p_dyn_hi' \
          -o -name '*_debug*.a' -o -name '*_debug*.so' \) -delete
# haddock and what only it needs
rm -f bin/*haddock*
L=lib/wasm32-wasi-ghc-9.14.1.20261012-inplace
rm -rf $L/haddock-api-* $L/haddock-library-* $L/xhtml-* $L/libHShaddock-* $L/libHSxhtml-*
rm -f lib/package.conf.d/haddock-* lib/package.conf.d/xhtml-*
# the ghc library and friends (purescript does not depend on them)
for p in ghc-9.14 ghc-toolchain hpc; do
  rm -rf $L/$p*; rm -f $L/libHS$p* lib/package.conf.d/$p*
done
bin/wasm32-wasi-ghc-pkg recache && bin/wasm32-wasi-ghc-pkg check   # expect only haddock-path warnings
# one copy of each host binary
(cd bin && for f in *-9.14.1.20261012; do b=${f%-9.14.1.20261012}; for n in $b ${b%-ghc}; do
   [ -f $n ] && [ ! -L $n ] && cmp -s $n $f && ln -sf $f $n; done; done)
cd ..
tar -C "$GHC" -cf - . | xz -9e -T0 > ghc-wasm-native-9.14.1.20261012-aarch64-darwin.tar.xz   # -T1 uses 675 MB RAM instead of 3.4 GB, 5 min
# user side
mkdir ghc && xz -dc ghc-wasm-native-*.tar.xz | tar -C ghc -xf -
```

(`ln -sf` over a regular file works on this Mac; on a real Nix output copy it first with `cp -a` and `chmod -R u+w`.)

A more conservative variant is to drop only the profiling files (v1, 2024 MB, not built); its compressed size was not measured. The full install alone compresses to 490 MB with `xz`.

If a single file had to be cut: it never has to. The largest measured (full, gzip) is 868 MB. If a future install were over 2 GB compressed, `split -b 1900m` and `cat` back; not needed here.

## Minimum to rebuild purs-core.wasm, and a "builder" tarball

Proven by the v4 build (it used only these):

- GHC pieces: `bin/wasm32-wasi-ghc`, `-ghc-pkg`, `-hsc2hs` (+ `hp2ps`, `unlit`, tiny); `lib/settings`, `lib/dyld.mjs`, `lib/post-link.mjs`, `lib/prelude.mjs`, `lib/package.conf.d`, and the wasm libs for the 36 remaining packages (`.a`, `.so`, `.hi`, `.dyn_hi`). 663 MB, 84 MB as `tar.xz`.
- Outside the install, all from Nix or fixed-output fetches: wasi-sdk fork (373 MB, `lib/settings` hard-codes its store path), node (Template Haskell via `dyld.mjs`), ghc-wasm-npm-deps (46 MB, `NODE_PATH`), cabal-install 3.16, happy and alex (the Nix recipe runs a native `happy`), 118 Hackage tarballs, purescript, cborg, cheapskate sources.

So yes, a builder tarball of only that is plausible and small: about 85 MB for the GHC part. But:

- `lib/settings` and the host-binary flags contain absolute `/nix/store/...-wasi-sdk/...` paths. Anyone not using the same store path must edit `lib/settings` (or the dev uses Nix and gets the same path).
- Host binaries are per platform: one tarball for aarch64-darwin, one for x86_64-linux. The wasm libraries inside may differ in bytes between hosts (ticket 27 saw different `purs-core.wasm` sizes from Docker and the Mac), so mixing is not verified.
- It is simpler for Nix users to put the pruned derivation in a binary cache than to ship tarballs; the tarball is for non-Nix developers.

## Risks and what was not verified

- Only `purs-core` (exe) was built from a pruned install. The app frontend build (`app-frontend-build-with-native-ghc.sh`, reflex-dom, much more Template Haskell) was not run against a pruned install. Profiling, `ghc`, `haddock` and `hpc` are very unlikely to matter there, but it is not shown.
- Everything was measured on aarch64-darwin. Linux sizes, the Nix `wrapProgram` wrappers (they reference the store output, so a copy of the output needs the wrapper paths rewritten), and ELF `strip` were not tested. `dontFixup = true` in the derivation means Nix does not strip the binaries today; turning fixup on is untested and could touch the wasm files.
- Making the pruning a Nix derivation: putting the `rm` steps in `ghc-wasm-native.nix`'s `installPhase` changes its hash and means one more 3 h build. A separate `runCommand` that copies the output is cheap but unwritten and untested.
- The `name`-section strip removes function names from wasm stack traces; the build works without them, but I did not check what a Template Haskell error message looks like. Skip it (3 MB gain compressed).
- Removing `hpc` and `ghc-toolchain` was done together with `ghc`; I did not test them one by one. `ghc-experimental`, `ghc-compact`, `haskeline`, `semaphore-compat` and others could also go (small) but were not tried.
- Reproducibility: the pruned and the full install both produce `purs-core.wasm` with sha256 `55c0cb4ddfc6e4e1db79ee4f28bfef4042300c95b4d4ef53f7c6ff5b8f296b60` (23,516,000 bytes), so pruning changes nothing in the output. That is a different file from ticket 14's Mac wasm (23,625,988) and from ticket 27's Docker wasm (23,585,103), so the same sources give three different sizes on three toolchains.

## Contradicts or corrects existing notes

- Ticket 14's table says the "compiled output" (`externs.cbor` and JS of a PureScript compile) is byte-identical between the gmp and native toolchains. That is about the PureScript compiler's output, not the wasm itself. The wasm is not byte-identical across builds (ticket 27 already notes this); here the same install gave the same wasm twice (full and pruned), so the wasm is reproducible per install.
- The 3.4 GB figure is not a distribution problem: compressed, the unpruned install is 490 to 868 MB.
- About 84% of the install is not needed by the purs-core build (v4 passes): profiling libraries, the `ghc`/`haddock` packages, doubled binaries.

## Open questions

- Is the x86_64-linux Nix output also 2/3 prunable? Expect yes (same package list), but run the recipe on a copy of the real output and rebuild `purs-core` to confirm.
- Where to host: GitHub Release (84 MB fits) or Cachix/GitHub Actions cache (the Nix route already works without any of this, if the derivation is cached; ticket 27 step 2).
- Whether to prune inside the cached derivation (smaller cache entry, one more 3 h build) or in a derived one.
