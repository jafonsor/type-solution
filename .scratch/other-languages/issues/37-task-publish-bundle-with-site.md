Type: task
Status: ready-for-human
Blocked by: 28

# 37: Publish the PureScript bundle with the site

## What to build

Ticket 28 builds the compiler bundle (`.#purs-bundle`: the compiler, one pack per library, the name table, the manifest and the pointer `current.json`) but nothing publishes it, so the live site cannot download the PureScript compiler. Make the Pages deploy include it under `purs/`, and check the live files by hash.

Owner (2026-11-10): do this as its own ticket, before the Checker worker (31). Try it on a branch first, never first on `main`: a mistake in the deploy step stops the whole site from deploying.

## Acceptance

- [x] `tools/export-site.sh` (or the deploy step) puts the bundle's files in the site folder under `purs/`, with the base path handled as for the other assets.
- [ ] `deploy.yml` builds `.#purs-bundle` without compiling GHC (it takes the released wasm) and keeps the existing gates in front of the deploy.
- [x] A check (script, run in the deploy before publishing, and runnable by hand against the live site) fetches `purs/current.json`, its manifest and every file the manifest names, and verifies each against the hash in its name.
- [x] The app's default `nix build` is unchanged in behaviour, and a deploy on a test branch (or a dry run into a scratch folder) shows the site still works for a JavaScript-only player: no request under `purs/` happens until the first PureScript pick.
- [ ] Record in the ticket: the bundle's size on the site, and the real Pages cache headers and download times for the compiler (the figures ticket 28 could only estimate).

## Not covered here

The Checker worker that uses the bundle (31).

## Comments

### As built (local, 2026-11-10)

- `tools/export-site.sh RESULT OUT BASE [PURS_BUNDLE]`: the optional 4th argument is the `.#purs-bundle` output, copied to `OUT/purs/` (made writable, since the Nix store is not). Without it the script's output is byte-identical to before (`diff -r` of two exports). The loader resolves `purs/current.json` against the page's own `<base>`, so the base path needs no rewriting: it is `/type-solution/purs/current.json` on Pages.
- `tools/purs-bundle/verify.mjs <base url>` or `--serve <site folder>`: fetches `purs/current.json`, the manifest and each file it names; checks the hash in each name (packs: of the gunzipped bytes), the manifest's `sha256` for the compiler, and the `bytes`/`rawBytes` sizes; exit 1 and one `FAIL` line per problem. Test: `tools/purs-bundle/test/verify.test.mjs` (in `npm test --prefix tools/purs-bundle`): passes on a real build; fails on one flipped byte in a pack, the compiler, the name table, the manifest or the pointer, a pointer naming another manifest, a missing pack or pointer, and an empty site.
- `deploy.yml`: new steps after "Build" and before "Publish": `nix build -L .#purs-bundle -o purs-bundle`; export with it; `node tools/purs-bundle/verify.mjs --serve site` plus a `du` and a guard against any file over 95 MB. All existing gates are untouched and still run first.
- Dry run (scratch folder, exported with BASE `/type-solution/`): `tools/purs-bundle/browser/drive-site.mjs` in Chrome 157 serves it under `/type-solution/` like Pages: page loads, editor mounts, **0 requests under `purs/`** for a JavaScript-only load; `purs/current.json` and the manifest then resolve at the right URLs (HTTP 200, 40 parts). `verify.mjs --serve` on it: 44 files verified. With one byte of a pack changed it exits 1.
- `nix eval --raw .#packages.aarch64-darwin.default.drvPath` is `/nix/store/g2qijkfrsy8ns1b3h493mg6p0na73dqx-server-exe.drv` before and after (nothing in `static/` or Haskell touched).
- Sizes, measured on the dry-run site: whole site 39,907,036 bytes (about 38.1 MiB); `purs/` 24,467,924 bytes in 44 files (compiler 23,585,103, the largest file; every pack under 120 KB); `ghcjs/` 14,287,012; `static/` 1,150,888. Far below Pages' 100 MB per-file and 1 GB site limits.
- Unverified until a real run: the `deploy.yml` change (YAML parses and `actionlint` reports nothing; each shell command was run locally, but not in Actions); the `.#purs-bundle` build time on a cold runner (the first local build fetched 40 GitHub archives one by one, about 30 min on a loaded machine; `magic-nix-cache` should serve later runs from cache).

### What the owner must do (needs a real deploy; never done by an agent)

1. Run the Deploy workflow on a test branch first (not `main`: a mistake stops the whole site deploying). Note the "Build the PureScript bundle" step's duration and that "Verify the PureScript bundle in the site" passes.
2. After the deploy, check the live site: `node tools/purs-bundle/verify.mjs https://jafonsor.github.io/type-solution/`
3. Measure and record here (not yet measured, no numbers invented):
   - cache headers: `curl -sI https://jafonsor.github.io/type-solution/purs/current.json` and the same for `purs/purs-core.<hash>.wasm` (hash from the manifest or `ls`); look at `cache-control`, `etag`, `content-encoding`, `content-length`;
   - compiler download time: `curl -s -o /dev/null -w '%{time_total}s %{size_download} bytes\n' https://jafonsor.github.io/type-solution/purs/purs-core.<hash>.wasm` (a few runs, and with `--compressed` to see whether Pages compresses it).
4. Then tick the two open boxes and set `Status:` to `resolved`.
