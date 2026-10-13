# Grilling: choose the frontend stack

Type: grilling
Status: resolved
Blocked by: 01

## Question

Given the research findings, which stack does the MVP use: reflex-dom (and on which GHC backend), or PureScript (and with which UI library)? Include the build tool and how CodeMirror 6 and the code-runner worker are integrated.

## Answer

- **Framework:** reflex-dom on **Obelisk v2**.
- **Compile target (wasm vs JS backend):** not decided yet. It waits on a measured bundle size and is split out to "Research: Obelisk v2 WebAssembly frontend size" and "Grilling: Obelisk compile target".
- **Server:** keep Obelisk's small Snap backend, which only serves the app. There is still no server-side game logic, and player code still runs in the browser.
- **CodeMirror 6:** bundled with esbuild into a thin JS shim (`create` / `getDoc` / `onChange`). All editor behaviour lives in the shim: highlighting, auto-indent, no auto-closing brackets, and suggestions that can't be accepted. Reflex sees only document text and keystroke events. Game logic (Runs, timing, stats, Puzzle selection) lives in Reflex.
- **Test runner:** a plain-JS module worker with acorn, as in "Research: sandboxing player JavaScript in the browser". Haskell drives it through `new Worker` / `postMessage` / `terminate`. Its message protocol is the boundary.
- **Dev loop:** accept Obelisk v2's `ob-run` watch-and-rebuild, with no hot reload for now. Revisit only if it hurts.
