Type: grilling
Status: resolved
Blocked by: 18, 19

# 20: Which decisions on this map deserve ADRs?

## Question

Candidates: redrawing the MVP's "JavaScript only" (I7), Personal best per Puzzle and Language, the static-deploy rule with a lazy-loaded compiler bundle, and the licence note for the gmp-linked bundle. Decide which meet the bar in `docs/adr/` and `docs/agents/domain.md` (hard to reverse, surprising, a real trade-off), and note them for the handoff spec; do not write the ADRs on this map.

## Answer

**Plain version.** Two decisions on this map get an ADR; the rest are rules that `CONTEXT.md` and the spec already carry. The ADRs are not written here; the handoff spec lists them as build steps.

**Decisions** (grilled with the player, 4 questions):
- **ADR 0002, "Solutions can be typed in more than one Language".** Supersedes the MVP spec's I7 ("JavaScript only"). Records: Languages are a concept (`CONTEXT.md`), the four seams from [ticket 19](19-grilling-keeping-the-second-language-cheap.md) in one short paragraph, the `language` field on runs (missing = JavaScript), and the rejected alternatives (stay JavaScript-only; check on a server). Agreed.
- **ADR 0003, "A static deploy with a lazy-loaded compiler bundle".** Records: the static-deploy rule (GitHub Pages), the PureScript compiler shipped to the browser as a separate, fingerprinted, lazy-loaded and cached bundle, the port as plan of record with no numeric gate and the fallback left open (see the map's Not yet specified), and the build inside the app's own `nix build`. Rejected alternative: a server-side checker. Agreed.
- **No ADR for Personal best per Puzzle and Language.** It is a rule already in `CONTEXT.md`, and bests are derived, not stored, so it is cheap to change. Agreed.
- **No separate ADR for the `gmp` licence note.** It is a consequence of the build choice, not a decision with alternatives; it goes in the "consequences" of ADR 0003 and as a task in the handoff spec. **Open point raised by the player:** they recall using a `gmp`-free build. The record shows two things: [ticket 14](14-task-build-native-wasm-ghc.md) proved a `native` (no `gmp`) build works with identical output, but [ticket 13](13-grilling-compiler-bundle-build-and-deploy.md) chose the repo's existing wasm GHC (with `gmp`) plus a licence note, because the app's own wasm already contains `gmp`. If the player wants the `native` build instead, that reopens ticket 13's toolchain decision; ADR 0003 then drops the licence consequence. Until then the spec follows ticket 13.

## Amendment (2026-11-04)

The open `gmp` point is closed: the player chose the `gmp`-free build ([ticket 13 amendment](13-grilling-compiler-bundle-build-and-deploy.md)). There is no licence note; ADR 0003's consequence is instead that the repo builds and caches a custom GHC.
