Type: grilling
Status: resolved
Blocked by: none

# 09: What gate decides the PureScript port?

## Question

[Research 07](07-research-purs-browser-port.md) found the `purs` port "feasible with caveats" but unmeasured: nothing was built to the end. This map only plans, so decide what the spec says about the risk. Settle, with the user:
- Is the port the plan of record, with the spec carrying an explicit go/no-go gate (what is built first, what must be measured, and the numbers that mean "stop")? Candidate numbers: compiler download size, first-pick wait, check time against the 400 ms pause (or whether PureScript is checked on demand instead of on every pause), memory.
- Toolchain: GHC 9.8 wasm flavour (matches `purs` pins) or the repo's 9.14 with dependency drift; the cost in the repo's Nix setup.
- The `gmp` (LGPL) licence note for the shipped bundle.
- What "fails" means, so the fallback in the map's fog can graduate: switch first Language, a reduced checker, or no real type check.

## Answer

Resolved with the user, 2026-10-27.

- **Plan of record, no numeric gate.** The `purs` port to the browser is the plan. No stop numbers (download size, first-pick wait, memory, check time) are fixed up front: the user chose to build it first and set limits after seeing real measurements.
- **The build is the first work item, and it measures.** It records wasm size (raw, gzip, brotli), start-up, memory and one-module check time. Check cadence (every 400 ms pause versus on demand) is decided from those measurements, not now.
- **Toolchain: GHC 9.8 wasm flavour**, to match `purs`'s pins (agreed). Costs a second toolchain in the Nix setup.
- **Licence: the `native` wasm flavour** so the bundle has no `gmp` (LGPL); if `native` cannot build `purs`, ship a licence note beside the bundle (agreed).
- **Fallback not chosen.** What happens if the measurements are unacceptable is decided then, as a new decision; likely direction is a Language that already runs in a browser. Not specified further.
- **Scope note.** The user wants to implement now. This map is planning only (its Destination); the build is therefore a separate piece of work, ticketed in [10](10-task-build-purs-wasm.md), not resolved inside this map's spec.
