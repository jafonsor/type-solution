# PureScript compiler bundle

Builds what the browser downloads for PureScript besides the compiler's own page code: the released `purs-core.wasm`, and for each of the 40 libraries in `languages/purescript/packages.json` a **pack** (its sources, its modules' `externs.cbor`, the compiled `index.js` and `foreign.js`), a **manifest**, and the **name table** for the import popup. Spec: `.scratch/other-languages/spec.md` ("Build and shipping"), ticket 28.

## Build

With Nix (what CI should use; the app's default `nix build` is untouched):

```sh
nix build .#purs-bundle -o purs-bundle
```

Inputs are `purs-core-wasm` (`purs-wasm.nix`, the released compiler) and the libraries at their pinned commits (hashes in `languages/purescript/source-hashes.json`; regenerate with `node tools/purs-bundle/prefetch-hashes.mjs` after changing `packages.json`; the Nix file fails if the two disagree).

Without Nix, no GitHub runner needed (Node 20+; `npm ci --prefix tools/puzzle-check` is not needed for the build itself):

```sh
node tools/purs-bundle/build.mjs --wasm path/to/purs-core.wasm --libs path/to/checkouts --out out-dir
```

`--libs` is the same folder as `PURS_LIBS` (`<library>/src/**`). Output (about 25 s; deterministic, a second build gives the same bytes):

| file | what |
|---|---|
| `current.json` | `{"manifest": "manifest.<hash>.json"}`, the only fixed name. Fetch it with `cache: "no-cache"` so GitHub Pages' `max-age=600` does not hide a new version. |
| `manifest.<hash>.json` | `core` (compiler, names), `parts` (per library: `file`, `bytes`, `rawBytes`, `requires` = every library it needs, transitively, `modules`), `modules` (module -> library), `sourceMtime` |
| `purs-core.<hash>.wasm` | the compiler |
| `<library>.<hash>.pack.gz` | one library, gzip-compressed by us (not by the server), format in `static/bundle/pack.mjs` |
| `names.<hash>.json` | module -> `[name, kind]` exports, and the clash preferences, for ticket 32 |

Every name carries the first 16 hex digits of the sha256 of its content (for a pack, of the uncompressed pack, so a different zlib version does not rename it). Serve the folder as static files.

## Publishing and checking it (ticket 37)

`deploy.yml` runs `nix build -L .#purs-bundle -o purs-bundle` (the released wasm, no GHC compile), then `tools/export-site.sh result site /type-solution/ purs-bundle`, which copies the bundle to `site/purs/` (the loader addresses files relative to the page, so the base path needs no rewriting), then the check, before anything is published. By hand, for a local export:

```sh
nix build -o app && nix build .#purs-bundle -o purs-bundle
tools/export-site.sh app site / purs-bundle     # BASE is /type-solution/ for Pages
node tools/purs-bundle/verify.mjs --serve site  # serves site/ locally, checks site/purs/
```

and for the live site:

```sh
node tools/purs-bundle/verify.mjs https://jafonsor.github.io/type-solution/
```

`verify.mjs` fetches `purs/current.json`, the manifest and every file it names, and checks each file's hash against its name (a pack: of the gunzipped bytes; sha256 as well where the manifest records it), the sizes against the manifest (`bytes` as served, `rawBytes` unpacked), and exits 1 with one `FAIL` line per problem. It needs no build and no install (Node 20+).

## What the browser side needs to know

- `static/bundle/bundle.mjs`: fetch `current.json`, then the manifest and the compiler (the "first PureScript pick"), keep them in Cache Storage, delete cached files the new manifest does not name. `part(name)` / `partsWithRequirements(names)` fetch a library's pack only when asked.
- `static/bundle/trigger.mjs`: when to start (first pick of a Language that has a bundle, or page load when it is the remembered one).
- `static/bundle/purs-tree.mjs`: from the packs of the libraries a Solution imports (`librariesFor(manifest, importedModules(code))`), the file tree and `cache-db.json` for the compiler. **Every file from a pack must report the manifest's `sourceMtime` as its modified time** (the same for sources, externs and JavaScript) and `src/Main.purs` a later one that moves with edits; otherwise the compiler rebuilds the libraries.

## Tests

```sh
PURS_WASM=$(nix build .#purs-core-wasm --no-link --print-out-paths) PURS_LIBS=<checkouts> npm test --prefix tools/purs-bundle
```

Without the two variables the build tests (including `test/verify.test.mjs`) skip; the loader and trigger tests (`static/bundle/test/`) always run. `browser/drive.mjs` drives real Chrome (needs `playwright-core`, `esbuild` and `@bjorn3/browser_wasi_shim` in a folder named by `TOOLS`); see its header.
