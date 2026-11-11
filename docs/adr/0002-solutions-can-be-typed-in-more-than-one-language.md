# Solutions can be typed in more than one Language

The MVP spec (`.scratch/type-solution/spec.md`, I7) said Solutions are JavaScript and no other language is offered. This supersedes I7: the player can type a Solution in any shipped **Language** (`CONTEXT.md`), PureScript first, with JavaScript as the first Language in the same terms. The rest of the MVP contract stands. The full design is in `.scratch/other-languages/spec.md`.

## Why

The game is for practising typing code, and some developers want to practise the code they write: PureScript's symbols and layout differ from JavaScript's. The cost of a second Language is kept low on purpose, so a third one does not reopen the design.

## The four seams

A Language supplies four things and nothing else: a **Checker** (typed code and a Puzzle's tests in; pass, fail or a readable error out, including how the tests' JSON becomes a call), an **Editor mode**, optional **Import rules**, and a **bank folder** `languages/<name>/`. The dropdown, saved data, Run, Personal best and Puzzle file format do not change when a Language is added. JavaScript is refactored behind the same seams, so there is one code path.

## Saved data

Each new Run record has a `language` field. A missing field reads as JavaScript, so old records are never rewritten. Personal bests and the weak-key lists are derived from the runs per Language.

## Rejected alternatives

- **Stay JavaScript-only.** Simplest, but gives nothing to players who want to practise another language's symbols.
- **Check non-JavaScript Languages on a server.** It would break the no-server rule and send typed code off the browser; see ADR 0003.

## Consequences

- A Language ships only when every Puzzle in the bank has a Reference Solution and signature in it, so each new Puzzle costs one more Solution per Language.
- A Language that needs a server is out of scope, not a harder checklist.
