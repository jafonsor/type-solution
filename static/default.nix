# Static assets derivation.
# The project's pinned nixpkgs by default (static/generate builds this file
# on its own, and <nixpkgs> would be whatever channel the machine has).
{ pkgs ? import ../deps/nixpkgs {} }:

let
  # The CodeMirror editor shim (editor/src/editor.js), bundled into one
  # script that defines `window.TypeSolution`.
  editor = pkgs.buildNpmPackage {
    pname = "type-solution-editor";
    version = "0.1.0";
    # The shim also imports the Language-agnostic bundle trigger
    # (bundle/trigger.mjs), so the source holds both folders.
    src = pkgs.lib.fileset.toSource {
      root = ./.;
      fileset = pkgs.lib.fileset.unions [ ./editor ./bundle ];
    };
    sourceRoot = "source/editor";
    npmDepsHash = "sha256-TThBskA08iC8TRHG4Ga/sajvuHxlLjwskOgJYGR67bs=";
    nativeBuildInputs = [ pkgs.esbuild ];
    dontNpmBuild = true;
    # PureScript's two worker scripts (the compiler's, and the runner a fresh
    # sandbox worker runs the tests in) are built beside the shim and served
    # next to JavaScript's runner.js: the Checker finds them there.
    installPhase = ''
      esbuild src/editor.js --bundle --format=iife --minify --outfile=$out/editor.js
      esbuild src/languages/purescript/compiler-worker.js --bundle --format=iife --minify --outfile=$out/purs-compiler.js
      esbuild src/languages/purescript/sandbox.js --bundle --format=iife --minify --outfile=$out/purs-sandbox.js
    '';
  };

in pkgs.stdenv.mkDerivation {
  name = "static";
  src = ./src;
  installPhase = ''
    mkdir -p $out/{css,html,icons,images,js}

    cp -r css $out
    cp -r html $out
    cp -r icons $out
    cp -r images $out
    cp -r js $out
    cp ${editor}/editor.js $out/js/editor.js
    cp ${editor}/purs-compiler.js $out/js/purs-compiler.js
    cp ${editor}/purs-sandbox.js $out/js/purs-sandbox.js
  '';
}
