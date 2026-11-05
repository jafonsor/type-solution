{
  inputs = {
    self.submodules = true;

    obelisk.url = ./deps/obelisk;
    nix-haskell.follows = "obelisk/nix-haskell";

    nixpkgs.follows = "obelisk/nixpkgs";
    flake-compat.follows = "obelisk/flake-compat";
  };

  outputs = inputs@{ self, ... }:
    let nixpkgs = if inputs ? "nixpkgs" then inputs.nixpkgs else builtins.getFlake "nixpkgs";
        eachSystem = nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed;

        # Only these have a wasi-sdk and a wasm GHC bindist to build with.
        pursSystems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
        purs = nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed (system:
          let bundle = import ./nix {
                pkgs = nixpkgs.legacyPackages.${system};
                ghcWasmMeta = import "${inputs.nix-haskell}/pins/ghc-wasm-meta/thunk.nix";
              };
          in nixpkgs.lib.optionalAttrs (builtins.elem system pursSystems) {
            ghc-wasm-native = bundle.ghc-wasm-native;
            purs-core-wasm = bundle.purs-core-wasm;
          });
    in {
      legacyPackages = eachSystem (system:
        import ./default.nix { inherit system inputs; }
      );

      packages = eachSystem (system:
        let project = import ./default.nix { inherit system inputs; };
        in (rec {
          default = haskell-nix;
          haskell-nix = project.haskell-nix.serverExe.wasm;
          nixpkgs = project.nixpkgs.serverExe.js;
        }
        # The PureScript compiler bundle (ticket 27), built from pinned inputs
        # only: the gmp-free wasm GHC (cached on its own) and purs-core.wasm.
        # Not part of `default`, so the app's `nix build` is unchanged.
        // purs.${system}));

      checks = eachSystem (system:
        let project = import ./default.nix { inherit system inputs; };
        in {
          common-test = project.haskell-nix.hsPkgs.common.checks.common-test;
        });

      devShells = eachSystem (system:
        let shells = import ./shell.nix { inherit system inputs; };
        in {
          default = shells.haskell-nix;
          inherit (shells) nixpkgs;
        });
    };

  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://nixcache.reflex-frp.org"
      "https://cache.iog.io"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "ryantrinkle.com-1:JJiAKaRv9mWgpVAz8dwewnZe0AzzEAzPkagE9SP5NWI=" # reflex-frp
      "hydra.iohk.io:f/Ea+s+dFdN+3Y/G+FDgSq+a5NEWhJGzdjvKNGv0/EQ="
    ];
    allow-import-from-derivation = "true";
  };
}
