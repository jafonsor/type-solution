Type: task
Status: ready-for-agent
Blocked by: 28

# 37: Publish the PureScript bundle with the site

## What to build

Ticket 28 builds the compiler bundle (`.#purs-bundle`: the compiler, one pack per library, the name table, the manifest and the pointer `current.json`) but nothing publishes it, so the live site cannot download the PureScript compiler. Make the Pages deploy include it under `purs/`, and check the live files by hash.

Owner (2026-11-10): do this as its own ticket, before the Checker worker (31). Try it on a branch first, never first on `main`: a mistake in the deploy step stops the whole site from deploying.

## Acceptance

- `tools/export-site.sh` (or the deploy step) puts the bundle's files in the site folder under `purs/`, with the base path handled as for the other assets.
- `deploy.yml` builds `.#purs-bundle` without compiling GHC (it takes the released wasm) and keeps the existing gates in front of the deploy.
- A check (script, run in the deploy before publishing, and runnable by hand against the live site) fetches `purs/current.json`, its manifest and every file the manifest names, and verifies each against the hash in its name.
- The app's default `nix build` is unchanged in behaviour, and a deploy on a test branch (or a dry run into a scratch folder) shows the site still works for a JavaScript-only player: no request under `purs/` happens until the first PureScript pick.
- Record in the ticket: the bundle's size on the site, and the real Pages cache headers and download times for the compiler (the figures ticket 28 could only estimate).

## Not covered here

The Checker worker that uses the bundle (31).
