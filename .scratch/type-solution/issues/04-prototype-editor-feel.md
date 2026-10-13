# Prototype: editor feel and auto-advance

Type: prototype
Status: claimed
Blocked by: 03

## Question

Does the core loop feel good? Build a throwaway page with CodeMirror 6 (syntax highlighting, auto-indent, no auto-closing brackets, function-name suggestions that Tab/Enter can't accept) that re-runs one Puzzle's tests on typing pause and auto-advances on pass. Decide the pause delay, the suggestion presentation (ghost text vs list), and what feedback shows while tests fail.

## Comments

Prototype: ../../../prototype-editor-feel/ (`pnpm dev` → http://localhost:5177). Variants A/B/C via `?variant=`, pause via `?pause=` or the slider. Smoke-tested headless in Chrome: in all three variants a typed Solution passes, the Puzzle auto-advances, and Tab indents instead of accepting a suggestion.
