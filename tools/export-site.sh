#!/usr/bin/env bash
# Turn a `nix build` result into the static site GitHub Pages serves.
#
#   tools/export-site.sh RESULT OUT BASE [PURS_BUNDLE]
#
# RESULT is the build output (./result), OUT the folder to write (emptied
# first), BASE the path the site is served under, e.g. /type-solution/.
#
# PURS_BUNDLE, if given, is the output of `nix build .#purs-bundle`: its files
# are copied to OUT/purs/ (current.json, the manifest, the compiler, the packs).
# The loader addresses them relative to the page, so the base path needs no
# rewriting: under /type-solution/ they are /type-solution/purs/current.json.
#
# The backend only serves the page and its files, so it is run once here: the
# page it renders is saved as index.html, beside its asset folders.
set -euo pipefail

result=$(cd "$1" && pwd)
out=$2
base=$3
purs=${4:-}
port=${PORT:-8123}

rm -rf "$out"
mkdir -p "$out"

# Each name in an Obelisk assets folder is a directory holding a `type` file:
# `immutable` (the file itself is encodings/identity) or `redirect` (`target`
# names the immutable copy in the same folder). Write each as a plain file.
copy_assets() {
  local src=$1 dst=$2
  find -L "$src" -name type | while read -r t; do
    local dir rel file
    dir=$(dirname "$t")
    rel=${dir#"$src"/}
    case $(cat "$t") in
      immutable) file=$dir/encodings/identity ;;
      redirect) file=$(dirname "$dir")/$(cat "$dir/target")/encodings/identity ;;
      *) echo "unknown asset type in $t" >&2; exit 1 ;;
    esac
    mkdir -p "$dst/$(dirname "$rel")"
    cp "$file" "$dst/$rel"
  done
}
copy_assets "$result/static.assets" "$out/static"
copy_assets "$result/frontend.jsexe.assets" "$out/ghcjs"

if [ -n "$purs" ]; then
  [ -s "$purs/current.json" ] || { echo "$purs has no current.json: not a purs-bundle build" >&2; exit 1; }
  mkdir -p "$out/purs"
  cp -R "$purs"/. "$out/purs/"
  chmod -R u+w "$out/purs" # the Nix store is read-only; keep OUT removable
fi

(cd "$result" && exec env backend_datadir="$result" ./backend --port "$port") &
backend=$!
trap 'kill $backend 2>/dev/null || true' EXIT
for _ in $(seq 30); do
  curl -sf "http://localhost:$port/" -o "$out/index.html" && break
  sleep 1
done
[ -s "$out/index.html" ] || { echo "the backend never served the page" >&2; exit 1; }

# The page assumes it lives at the root: `<base href="/">` and absolute
# /ghcjs/ links. Point both at BASE, and fail if Obelisk stops rendering them.
grep -q '<base data-ssr="" href="/" />' "$out/index.html"
grep -q '"/ghcjs/' "$out/index.html"
sed -i.bak \
  -e "s|<base data-ssr=\"\" href=\"/\" />|<base data-ssr=\"\" href=\"$base\" />|" \
  -e 's|"/ghcjs/|"ghcjs/|g' \
  "$out/index.html"
rm "$out/index.html.bak"

# Without it GitHub Pages runs the folder through Jekyll.
touch "$out/.nojekyll"
