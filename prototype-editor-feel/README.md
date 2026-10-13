# PROTOTYPE (throwaway): editor feel and auto-advance

Answers [Prototype: editor feel and auto-advance](../.scratch/type-solution/issues/04-prototype-editor-feel.md).
Not production code. Delete once the ticket is resolved (the repo has no git, so there's no throwaway branch to move it to).

    cd prototype-editor-feel && pnpm dev   # http://localhost:5177

- `?variant=A|B|C` (or ←/→ in the bottom bar): suggestion presentation + failing-test feedback
  - **A**: inline ghost text, plus a quiet status dot and "n/m tests" count
  - **B**: a non-interactive hint list under the cursor, plus a side panel listing every test with expected/got
  - **C**: zen layout, with names in a peripheral strip under the editor, a border colour as the status, and only the first failing test whispered
- `?pause=<ms>`, or the slider: the typing-pause delay before tests re-run
- Esc gives up and moves to the next Puzzle. A pass auto-advances after 0.9 s
- Real stack pieces: CM6 bundled by esbuild (no closeBrackets, no autocompletion), acorn syntax check, and a fresh module Worker per check with a warm spare and a 1 s terminate
