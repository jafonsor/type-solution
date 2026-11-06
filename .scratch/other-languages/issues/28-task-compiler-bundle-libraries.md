Type: task
Status: ready-for-agent
Blocked by: 25, 36

# 28: Library externs, hashed files, Cache Storage

## What to build

Build order step 3, second half. From the pinned list, build externs and compiled library JavaScript; hashed file names and manifest; separate bundle kept in Cache Storage with old versions deleted; externs fetched per imported library. Measure the items the spec marks "not yet measured" (second library, real-network download, other browsers).

## Acceptance

- The app downloads the bundle only on the first PureScript pick (or at load if remembered).
- Figures recorded in the spec.
