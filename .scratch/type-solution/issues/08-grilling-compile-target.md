# Grilling: Obelisk compile target

Type: grilling
Status: resolved
Blocked by: 07

## Question

Given the measured sizes and startup times, does the Type Solution frontend build to WebAssembly (Obelisk v2's default) or to GHC's JavaScript backend?

## Answer

**WebAssembly** (Obelisk v2's default), for both development and production. The JS backend is out of scope.

- **Why:** wasm is the target proven end to end on this Mac: production `nix-build`, and the `ob-run` dev loop on the jafonsor Obelisk fork (see "Task: get Obelisk v2 building on this Mac"). With wasm working for both dev and prod, there's no reason to carry a second toolchain. Getting the JS target building here would likely mean compiling a GHC JS cross-compiler from source.
- **Accepted cost:** about 2× the download of the JS build (≈0.96 vs ≈0.50 MB brotli for the starter app; about 1.1 vs 0.64 MB with CM6). On a constrained link (≈9 Mbit/s) that's roughly 1.2 s vs 0.6 s to first render. Locally wasm starts faster (≈45–63 ms vs ≈130–180 ms). Server-side prerendering means the page paints before any Haskell runs.
