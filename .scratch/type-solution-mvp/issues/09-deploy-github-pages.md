Status: ready-for-agent

# 09: Deploy to GitHub Pages

## What to build

Every push to `main` builds the game and publishes it at `jafonsor.github.io/type-solution`, with no server running in production. A push whose Puzzle bank check or tests fail never deploys.

## Acceptance criteria

- [ ] A GitHub Actions workflow runs on each push to `main`: the Puzzle bank check, the common test suite, then `nix build` (WebAssembly).
- [ ] A step runs the built backend once, saves the first page it renders plus the asset folders, and that folder is the site.
- [ ] The folder is force-pushed as a single commit to the `gh-pages` branch, and GitHub Pages serves it.
- [ ] The game loads and plays at `https://jafonsor.github.io/type-solution/`: every asset link (CSS, editor shim, runner script, wasm) works under the `/type-solution/` sub-path.
- [ ] A failing check or test stops the workflow before deploying.
- [ ] Smoke-tested on the live site: pass a Puzzle, pause and resume, skip, repeat, an endless loop times out.

## Blocked by

- 02: Puzzle bank check

## Notes for whoever implements it

- Source: `.scratch/type-solution/spec.md` ("Hosting"); decided in `.scratch/type-solution/issues/13-grilling-hosting.md`, whose CSP part is replaced by `.scratch/type-solution/issues/15-grilling-csp-policy.md`.
- **No Content-Security-Policy, no meta tag, no blob-URL worker.** Ticket 13 still mentions them; ticket 15 dropped them. The worker keeps loading from the runner script's file address.
- Rejected: a Linux server (VPS / Fly.io), because the backend has nothing to do in production; also Cloudflare Pages for real headers, not worth a second host.
- Old builds don't pile up because each deploy is one force-pushed commit; any old build can be rebuilt from its `main` commit.
- No custom domain for now; adding one later changes nothing else.
- The build uses the jafonsor Obelisk `macos-v2` fork (see `.scratch/type-solution/issues/09-task-obelisk-on-mac.md`); the CI runner is Linux, so check that the flake builds there. Use a Nix cache if the first build is too slow for Actions.
- Obelisk's `static @"…"` links are absolute by default; the sub-path is the likeliest thing to break.
