{ config, lib, pkgs, obeliskLib, nix-haskell-compilers, nix-haskell-patches, ... }:

{

  # The nixpkgs driver has no wasm compiler of its own. The ghc-wasm-meta
  # bindist gives it one. The haskell.nix driver builds its own, but on
  # darwin that compiler is not in the binary caches and builds from source
  # for hours, so it takes the bindist too (as release.nix's `wasm-meta`
  # variant does in the obelisk repo). Each series matches that driver's own
  # compiler.
  imports = [
    (import "${nix-haskell-compilers}/ghc-wasm-meta" {
      flavour = "9.12";
      drivers = [ "nixpkgs" ];
    })
    (import "${nix-haskell-compilers}/ghc-wasm-meta" {
      flavour = "9.14";
      drivers = [ "haskell-nix" ];
    })
  ];

  name = "type-solution";
  src = ./.;

  inherit (obeliskLib) source-repository-packages;

  obelisk.static.path = import ./static { inherit pkgs; };
  # For projects without a build step, use:
  # obelisk.static.path = ./static/src;

  # Public config (common/ + frontend/) is bundled into the production server;
  # backend/ is never bundled (keep secrets out of the Nix store).
  obelisk.config.path = ./config;

  # For the editor (VS Code's Haskell extension, with haskell.manageHLS =
  # PATH): built with the project's own GHC. No binary cache has it for GHC
  # 9.14 on darwin, so the first build compiles it; build it with limited
  # cores (`--cores 4`), as all cores ran a 32 GB machine out of memory.
  # HLS 2.14 is tested with GHC 9.14.1 and is in the pinned hackage index
  # (2.15 is not: the index ends 2026-07-31). cabalProjectLocal is the
  # constraints and allow-newer tail of HLS 2.14's own cabal.project, which
  # is how upstream builds it against 9.14.
  # Set on the driver because nix-haskell drops a top-level `shell.tools`:
  # the driver mirror seeds the whole attrset at priority 1400, and its own
  # `cabal` default makes `tools` a priority-100 definition, which wins.
  # HLS loads the project's libraries into its own process (for Template
  # Haskell), so its own copies of shared libraries (random, uuid-types,
  # lens, ...) must be compiled exactly like the project's: they carry the
  # same unit ids, and a copy built differently fails to link (dyld "Symbol
  # not found"). Obelisk builds every package with `optimizations.all`
  # (config.ghcOptions) and patches splitmix (nix-haskell's js/splitmix);
  # neither enters the unit id. So HLS's packages take the same flags,
  # through cabal.project (haskell.nix's project-wide `ghcOptions` is only a
  # default, which the tool plan's per-package options replace), and the
  # same patch, copied to the same store path as the project's.
  haskell-nix.shell.tools.haskell-language-server = {
    version = "2.14.0.0";
    modules = [{
      packages.splitmix.patches = [
        (builtins.path {
          name = "splitmix-js.patch";
          path = "${nix-haskell-patches}/js/splitmix/splitmix-js.patch";
        })
      ];
    }];
    cabalProjectLocal = ''
      package *
        ghc-options: ${lib.concatStringsSep " " config.ghcOptions}
      constraints:
        text -simdutf,
        ghc-check -ghc-check-use-package-abis,
        ghc-lib-parser-ex -auto,
        stylish-haskell +ghc-lib,
        bitvec -simd,
        monad-control >=1.0.3,
      allow-newer:
        cabal-install-parsers:Cabal-syntax,
      if impl(ghc >= 9.11)
        benchmarks: False
        allow-newer:
          cabal-install-parsers:base,
          cabal-install-parsers:time,
      if impl(ghc >= 9.14)
        allow-newer:
          aeson:containers,
          aeson:template-haskell,
          aeson:time,
          binary-instances:base,
          binary-instances:tagged,
          binary-orphans:base,
          boring:base,
          cabal-install-parsers:containers,
          constraints-extras:template-haskell,
          dependent-map:containers,
          ghc-trace-events:base,
          hie-compat:base,
          indexed-traversable:base,
          indexed-traversable:containers,
          indexed-traversable-instances:base,
          lukko:base,
          quickcheck-instances:base,
          quickcheck-instances:containers,
          semialign:base,
          semialign:containers,
          string-interpolate:template-haskell,
          tasty-hspec:base,
          text-iso8601:time,
          these:base,
          time-compat:base,
          time-compat:time,
          uuid-types:template-haskell,
          websockets:containers,
    '';
  };

  shell = {
    crossPlatforms = ps: with ps; [
      wasi32

      # To enable JS builds in `nix-shell`, uncomment ghcjs below and use:
      #   cabal build/repl/run backend -f js
      #   ob-run/ob-repl -f js
      # ghcjs
    ];
    withHoogle = true;

    # The shell points DEVELOPER_DIR at nix's Apple SDK, and macOS's
    # /usr/bin/git is a shim that follows it ("tool 'git' not found").
    nativeBuildInputs = [ pkgs.git ];
  };

}
