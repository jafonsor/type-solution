Type: research
Status: resolved
Blocked by: none

# 03: Editor support for PureScript

## Question

The editor is CodeMirror 6 (`static/editor/`), with `@codemirror/lang-javascript` for highlighting, bundled by esbuild in `static/default.nix`.

Find, from primary sources (the CodeMirror docs, npm, the Lezer repos), what exists for highlighting PureScript: a maintained CodeMirror 6 or Lezer grammar, a legacy-mode (`@codemirror/legacy-modes`) option such as Haskell's, or writing one. Report the licence, bundle size and how well it handles PureScript-specific syntax (type signatures, `where`, `<$>`, operators), and what language-specific editor behaviour the project would have to switch with the dropdown (indentation, auto-closing brackets, comment syntax).

Capture the findings under `.scratch/other-languages/research/`.

## Answer

No published CodeMirror 6 or Lezer grammar for PureScript exists, and `@codemirror/legacy-modes` has no PureScript mode. The cheap route is the bundled Haskell stream mode (MIT, about +4 KB gzipped), wrapped in a ~30 line tweak to add `forall`/`true`/`false`/`ado`, fix `"""` raw strings and tag operators; it already handles `--`/`{- -}` comments, `::`, `->`, `where` and `<$>`. A real Lezer grammar needs a port of PureScript's layout algorithm and is not worth it. Per-Language editor switches are only the language extension (comment markers and a "copy previous line" indent come with it); there is no auto-close or autocomplete to switch.

Full findings: [.scratch/other-languages/research/03-editor-purescript.md](../research/03-editor-purescript.md)
