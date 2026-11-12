Type: task
Status: ready-for-human
Blocked by: none

# 40: CI builds only what changed (a Nix store cache that works)

## What was found

The first real Deploy (run 43086373196, 2026-11-11) took 33 minutes. The app's `Build` step was 27 of them, almost all of it compiling third-party Haskell libraries (aeson, lens and so on; 1,607 modules, native and wasm) from source on a cold runner. The bundle build took 48 seconds. Nix rebuilds only derivations whose inputs changed, but only if their outputs come from a cache. They did not: the log says `GitHub Actions Cache throttled Magic Nix Cache. Not trying to use it again on this run.` Only the paths downloaded before the build were saved (460 entries, 0.68 GB, all created between 19:23 and 19:26 UTC); nothing built during the 27 minutes was. Likely cause (an inference, not proven): `magic-nix-cache` uploads one small cache entry per path, Deploy and the smoke workflow ran at the same time on the same push, and GitHub's cache API throttled the writes.

## What was built (on branch `ci-nix-cache`, merged to `main` locally)

- `deploy.yml` and `purescript-smoke.yml` replace `DeterminateSystems/magic-nix-cache-action` with `nix-community/cache-nix-action@v7`: the whole Nix store as one cache entry, restored by key (a hash of the `*.nix`, `*.cabal`, `cabal.project` and the PureScript package list files) or, failing an exact match, by the newest older entry (so a change rebuilds only what differs), saved after the job, garbage-collected to 10 GB first, old entries purged.
- `keep-outputs = true` and `keep-derivations = true` in the Nix config, so the garbage collection before saving keeps the compiled libraries (they are build inputs, not part of the final app's closure). Every build keeps a result link (`result`, `result-common-test`, `purs-bundle`, `app`, `purs-core-wasm`, `purs-libs`) so there is a root.
- Both workflows run their Nix job through the same job-level `concurrency` group (`nix-build`, no cancelling), so they run one after the other, and the second finds what the first built.
- `actions: write` permission in both workflows, which the cache action needs to purge its old entries.

## Acceptance

- [x] A run on a cold cache saves the store (the post step reports a saved cache of a size under 10 GB and the Actions cache list shows it), instead of being throttled.
- [x] A second run with the same key restores it and the `Build` step takes minutes, not 27 (record both durations; expected: the dependencies come from the cache, only the project's own code compiles).
- [ ] A run after a change to the editor or a script (no Haskell dependency change) restores the older entry by prefix and rebuilds only the project's own derivations.
- [x] Deploy and smoke no longer overlap on a push to `main`, and both still pass.
- [x] Record the cache size and the restore time.

## Comments

Validated locally with `actionlint` only (exit 0). Not run in Actions yet: the action's inputs follow its README at v7, the cache key and size, whether `keep-outputs` keeps all the libraries, and the restore time are all unmeasured until the first runs. If the cache entry exceeds GitHub's limit or the restore costs more than the build saves, the fallback is Cachix (the owner creates the account and a repo secret). Owner chose this option on 2026-11-12.

## First runs with the new cache (2026-11-12)

Owner approved the push of `main` (`5a8205e..44aabea`). Deploy (run 43245971358) and the smoke test (run 43245971540) started together and ran one after the other: the smoke job waited as `pending` until Deploy finished, so the queue works, and both passed.

- **Cold run (Deploy), cache key `nix-Linux-2c3dd2ef…`, no entry yet:** 28 min 39 s in all. `Build` 21 min 29 s (it was 27 min the day before; the compile is cold either way), common tests 2 min 23 s, bundle 39 s. The cache did not throttle. The post step found a store of 18.1 GB, garbage-collected it to the 10 GB target, and saved **one entry of 3.44 GB** (compressed) in 99 s. The repo's whole Actions cache is now 4.1 GB in 461 entries, under the 10 GB limit.
- **Warm run (smoke), same key:** `Cache hit`, restore **1 min 42 s**. `Build` **2 min 11 s** (against 21 to 27 min cold), bundle 1 s, the smoke test 69 s. The garbage collection kept the compiled libraries (the `keep-outputs` setting worked). The job also had a 10-minute `Free disk space` step this time (114 s on the Deploy run); that is runner variance, not the cache.
- **Not yet shown:** the third criterion, a run after a change to a Nix, cabal or package-list file (a new key, restoring the older entry by prefix and rebuilding only what differs). A change that does not alter those files (for example the editor or a script, or docs) keeps the same key and gets an exact hit, which is the warm case above. The first push that changes the key will show the prefix restore; record its `Build` time here.
- Because the warm run is the same key, the warm figure is the best case: it rebuilds only the app's own derivations (a few minutes) and the bundle.

Status stays `ready-for-human` until the prefix-restore run is recorded.
