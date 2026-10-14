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
    src = ./editor;
    npmDepsHash = "sha256-pChH5S0y7nktUZ4jczTVS6jlyJXBDPf+o8uaXXO8HuY=";
    nativeBuildInputs = [ pkgs.esbuild ];
    dontNpmBuild = true;
    installPhase = ''
      esbuild src/editor.js --bundle --format=iife --minify --outfile=$out/editor.js
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
  '';
}
