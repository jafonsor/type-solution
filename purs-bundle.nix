# The lazy-loaded PureScript bundle (flake output `purs-bundle`, not the default
# package): the pinned libraries' externs and compiled JavaScript, content-hashed
# file names and the manifest, built with the released compiler.
#
#   nix build .#purs-bundle -o purs-bundle      # then serve ./purs-bundle/
#
# Inputs: `purs-core-wasm` (purs-wasm.nix, the released compiler) and the 40
# libraries of languages/purescript/packages.json at their commits, fetched with
# the hashes in languages/purescript/source-hashes.json (regenerate with
# tools/purs-bundle/prefetch-hashes.mjs after changing packages.json). Without
# Nix: tools/purs-bundle/README.md.
{ lib, runCommand, linkFarm, fetchFromGitHub, nodejs, purs-core-wasm }:

let
  pinned = builtins.fromJSON (builtins.readFile ./languages/purescript/packages.json);
  hashes = (builtins.fromJSON (builtins.readFile ./languages/purescript/source-hashes.json)).libraries;

  source = l:
    let h = hashes.${l.name} or (throw "source-hashes.json has no ${l.name}: run tools/purs-bundle/prefetch-hashes.mjs");
    in assert lib.assertMsg (h.commit == l.commit)
      "source-hashes.json has ${l.name} at ${h.commit}, packages.json at ${l.commit}: run tools/purs-bundle/prefetch-hashes.mjs";
    fetchFromGitHub { inherit (h) owner repo hash; rev = h.commit; };

  libs = linkFarm "purs-libs-${pinned.packageSet}"
    (map (l: { name = l.name; path = source l; }) pinned.libraries);

  # Only the files the build reads, so editing a Puzzle or the app does not
  # rebuild the bundle.
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./languages/purescript
      ./languages/javascript/language.json
      ./static/bundle/pack.mjs
      ./static/bundle/purs-tree.mjs
      ./tools/purs-bundle/build.mjs
      ./tools/puzzle-check/package.json
      ./tools/puzzle-check/languages.js
      ./tools/puzzle-check/purs-imports.js
      ./tools/puzzle-check/purs-exports.js
      ./tools/puzzle-check/purs-runner.js
    ];
  };
in
runCommand "purs-bundle-${pinned.packageSet}" { nativeBuildInputs = [ nodejs ]; } ''
  node --no-warnings ${src}/tools/purs-bundle/build.mjs \
    --wasm ${purs-core-wasm} --libs ${libs} --out $out
''
