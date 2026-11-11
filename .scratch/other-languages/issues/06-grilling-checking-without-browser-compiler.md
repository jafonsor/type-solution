Type: grilling
Status: resolved
Blocked by: none

# 06: How does PureScript get checked with no browser compiler?

## Question

[Research 01](01-research-purescript-in-browser.md) found no maintained PureScript compiler that runs in a browser; Try PureScript compiles on a server. The map's rules are a static GitHub Pages deploy, no server-side checking, player code run in the browser. Decide the route, with the player's cost for each:
- Build `purs` for WebAssembly or JavaScript ourselves (the repo already builds Haskell to WASM; is a compiler-sized port a research project of its own, and is it worth it?).
- Allow a compile server for non-JS Languages, redrawing the "no server" rule (hosting, cost, abuse, latency against the 400 ms check, privacy of typed code).
- Choose a first Language that already has a browser implementation, which changes "PureScript first".
- Another route the user prefers.

This decides whether PureScript stays the first Language and whether the destination (a static deploy) holds. Likely ends with an ADR if the rules are redrawn.

## Answer

Resolved 2026-10-27 by grilling with the user.

- **Static deploy is a hard rule.** No compile server; typed code never leaves the browser.
- **PureScript stays the first Language.** The route is to try porting `purs` to WebAssembly or JavaScript ourselves. The port is judged by a feasibility ticket on this map ([Can purs be built for the browser?](07-research-purs-browser-port.md)); building it for real is beyond this map, which only plans.
- **If the port proves infeasible, "do something else."** The something else is not chosen yet. It sits in the map's fog as a fallback, to be graduated when ticket 07 reports.
- **Shape of any Language's compiler, whatever the route:** a separate bundle, not in the main one, fetched only when the player first picks that Language. Fingerprinted file names (the URL changes when the content does), saved with the Cache API or a service worker rather than relying on GitHub Pages' ~10 minute cache lifetime, so later visits and offline use are instant. Served from the same static site, so "no server" holds. Needs a narrow same-origin allowance in the CSP (to verify against the CSP decision in the first map's ticket 15).
- Cost to the player: a one-time download and start-up wait on first pick of the Language; nothing for players who never pick it.
