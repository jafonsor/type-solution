# Prototype: editor feel and auto-advance

Type: prototype
Status: resolved
Blocked by: 03

## Question

Does the core loop feel good? Build a throwaway page with CodeMirror 6 (syntax highlighting, auto-indent, no auto-closing brackets, function-name suggestions that Tab/Enter can't accept) that re-runs one Puzzle's tests on typing pause and auto-advances on pass. Decide the pause delay, the suggestion presentation (ghost text vs list), and what feedback shows while tests fail.

## Comments

Prototype: ../../../prototype-editor-feel/ (`pnpm dev` → http://localhost:5177). Variants A/B/C via `?variant=`, pause via `?pause=` or the slider. Smoke-tested headless in Chrome: in all three variants a typed Solution passes, the Puzzle auto-advances, and Tab indents instead of accepting a suggestion.

## Answer

Built in the real app rather than as a throwaway page (the fizzBuzz Run), and judged right after playing it:

- **Pause before checking:** 400 ms after the last edit. Each check runs in a fresh worker, stopped after 1 s.
- **Suggestions:** none. The editor has highlighting and auto-indent, without auto-closing brackets or suggestions, and it felt right that way.
- **Feedback while failing:** below the editor, each failed test as "`fizzBuzz(10)` should return `"Buzz"`, got `"10"`", or the syntax error, crash or timeout. No hints.
- **On pass:** the clock freezes and the result shows; Esc starts another Run.
