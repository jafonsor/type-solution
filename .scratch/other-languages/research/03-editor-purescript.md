# 03: Editor support for PureScript

Researched 2026-10-26 against primary sources only (npm registry, package source, GitHub repositories, the CodeMirror and Lezer docs, the PureScript compiler source). Versions are the ones in `static/editor/package.json`'s lock range at the time: `@codemirror/language` 6.13.1, `@codemirror/lang-javascript` 6.2.5, `@codemirror/legacy-modes` 6.5.5, `@lezer/javascript` 1.5.6.

## In plain language

- **No ready-made PureScript highlighter exists for our editor.** I found no published CodeMirror 6 or Lezer grammar for PureScript. The one repository that looks related (`rowtype-yoga/purescript-codemirror6`) is a set of PureScript bindings to CodeMirror, not a PureScript highlighter.
- **The cheap option is the Haskell mode that ships with CodeMirror.** PureScript looks a lot like Haskell, so the Haskell mode gets most of it right: comments, strings, numbers, `where`, `::`, `->`, `<-`, `<$>`. It costs about 4 KB of download (gzipped) on top of what we ship now, and the licence is MIT, same as everything else we use.
- **It gets some things wrong.** `forall`, `true`, `false` and `ado` are not coloured as keywords. Triple-quoted strings (`"""..."""`) break and the rest of the line turns red. Haskell's standard-library names (`map`, `foldr`, `Maybe`) are coloured as built-ins, which is harmless and even helpful, but it is Haskell's list, not PureScript's. All of this is small enough to fix by wrapping the Haskell mode in a short PureScript tweak (about 30 lines).
- **Writing a proper PureScript grammar is possible but is real work.** PureScript decides block structure from indentation, so a grammar needs a hand-written helper in JavaScript. That is not worth it for 4-12 line Puzzles.
- **What changes with the dropdown is small.** Colouring, the comment markers (`--` and `{- -}` instead of `//` and `/* */`), and how the editor indents a new line. The editor does not auto-close brackets or autocomplete today, so there is nothing to switch there.

## Technical detail

### 1. What exists

| Option | Exists? | Source |
|---|---|---|
| Published CM6 / Lezer grammar for PureScript | Not found | npm registry search (`purescript codemirror`, `lezer purescript`, `purescript syntax`) returned no such package; `@lezer/*` packages are the official set (common, highlight, javascript, lr, ...). GitHub repository search for `purescript codemirror` found only the repo below (the `lezer purescript` search query errored and was not re-run; the npm search for it found nothing). |
| `rowtype-yoga/purescript-codemirror6` | Bindings, not a grammar | Its `package.json` is `private`, version 0.0.1, MIT, no description; `src/` holds only `CodeMirror.purs` and `CodeMirror.js`. The `.purs` file exports `defineStreamLanguage`, `defineHighlightStyle` and similar bindings, and contains no tokenizer or PureScript keyword list (grep for `purescript`, `keyword`, `forall` in `CodeMirror.js` found nothing). Single commit "Release codemirror 0.0.1". |
| `@codemirror/legacy-modes` PureScript mode | No | 103 modes in 6.5.5; none is named purescript. Closest: `haskell`, `elm` (also `mllike`). |
| Tree-sitter PureScript grammars | Exist (`postsolar/tree-sitter-purescript`, MIT, pushed 2025-06; others older) | Not usable in CodeMirror 6 directly; tree-sitter grammars are a different parser format from Lezer. Listed only to show PureScript grammars exist elsewhere. |
| Write a Lezer grammar | Possible | See section 4. |

### 2. Legacy (stream) mode option: `haskell`

`@codemirror/legacy-modes/mode/haskell` is a hand-written tokenizer (6,946 bytes unminified, `haskell.js`), used via `StreamLanguage.define(haskell)` from `@codemirror/language`. Licence: MIT (package `license` field and `LICENSE`). Its only dependency is already pulled in by CodeMirror.

**Bundle size** (measured with esbuild, `--bundle --minify --format=iife`, entry importing `EditorView`, `EditorState`, `syntaxHighlighting`, `HighlightStyle` plus the language; this is a lower bound for the real `editor.js`, but the difference between rows is what matters):

| Build | Minified | Gzip -9 |
|---|---|---|
| view + state + language only | 240,890 B | 79,141 B |
| + `lang-javascript` (today) | 366,142 B | 125,579 B |
| + `haskell` legacy mode only | 253,527 B | 83,746 B |
| + both (JavaScript and Haskell mode) | 378,071 B | 129,747 B |

So adding the Haskell mode to what we ship now costs about **11.9 KB minified, 4.2 KB gzipped**. Another stream mode of similar size would cost about the same, which keeps the "second Language is cheap" goal.

**How it handles PureScript.** I ran the mode over a PureScript sample and looked at the tags it produced (script run in the scratchpad against the packages above; not committed).

Handled well:
- `--` line comments and nested `{- ... -}` block comments (matches the PureScript lexer: `comment` branches on `"{-"` and `"--"`, `Lexer.hs` around line 224).
- Type signatures: `::` and `->` are keywords; capitalised names get a type/builtin tag; `=>` is a keyword.
- `where`, `case`, `of`, `let`, `in`, `do`, `data`, `newtype`, `class`, `instance`, `import`, `module`, `type`, `infix*`, `if/then/else`, `foreign`, `deriving` are keywords.
- Operators like `<$>`, `$`, `<>`, `>>=`, `#`, `*` are tokenised as one operator each (the mode eats runs of symbol characters; the PureScript lexer defines symbol chars as ``:!#$%&*+./<=>?@\^|-~`` plus non-ASCII symbols, `isSymbolChar`, `Lexer.hs` line 730, almost the same set as Haskell's `symbolRE`). Caveat: the mode returns the tag `variable` (or `builtin` for a few) for operators, not `operator`, so under our `HighlightStyle` (`editor.js`: operators and punctuation use `--syn-punctuation`) most operators come out as plain names, not punctuation-coloured. A one-line change in a wrapper fixes this.
- Identifiers with primes (`x'`), char literals (`'a'`), normal strings, hex/octal/decimal numbers.

Wrong or missing:
- `forall` is not a keyword. In PureScript it is lexed as its own token (`TokForall`, `Lexer.hs` line ~458).
- `true`, `false` and `ado` are plain names. The PureScript parser's reserved-word list (`Parser.y` lines 94-125) is: `ado as case class data derive do else false forall foreign hiding import if in infix infixl infixr instance let module newtype nominal phantom of representational role then true type where`. The Haskell list lacks `ado`, `derive`, `false`, `forall`, `true`, and has `default` and `deriving` that PureScript does not (here `as`, `hiding`, `role`, `nominal`, `phantom`, `representational` are contextual and may be plain identifiers, so leaving them uncoloured is fine).
- **Triple-quoted raw strings** (`"""..."""`, `Lexer.hs` line ~504, may span lines and contain `"`): the Haskell mode treats `"""` as an empty string followed by a new string, so text inside is mis-coloured and the last `"` on a line is tagged invalid (red). Single-line cases mostly survive; multi-line and embedded-quote cases do not. Our Puzzle size rule (4-12 lines, 100-350 characters) makes raw strings unlikely, but a player could type one.
- Record syntax `{ name: "x" }`, row types, `_` accessor sections like `_.age`: `_` is tagged a keyword (correct for PureScript's `_` wildcard), and `:` a keyword. Acceptable.
- Haskell Prelude names (`map`, `foldl`, `Maybe`, `String`, `Int`) are tagged `builtin`. Many exist in PureScript's Prelude too; some (`Integer`, `IO`, `putStrLn`) do not. Only visible if the theme styles `builtin`; ours does not (no rule for it in `highlight`), so it is invisible today.

**Elm mode, for comparison.** Same loader, similar size class. It handles `"""` raw strings and types well, but on the same sample tags `$` and `#` as invalid (red) and `forall`, `true`, `false`, `ado` as plain names. Worse than Haskell for PureScript's operator-heavy style.

**Fix for the gaps.** Wrap the Haskell mode: a ~30 line object that delegates to `haskell.startState`/`token`, adds the keyword set above, adds a raw-string state, and remaps operator tags. `StreamLanguage.define` accepts any such object; nothing else in the editor changes.

### 3. Language-specific behaviour the editor must switch

Based on `static/editor/src/editor.js` and the CodeMirror package source.

| Behaviour | Today (JavaScript) | For PureScript | Switch needed? |
|---|---|---|---|
| Highlighting | `javascript()` extension, `HighlightStyle` mapping tags to CSS variables | A stream language (above). The existing `HighlightStyle` is language-neutral because it keys on `@lezer/highlight` tags, so colours, light and dark schemes carry over. | Yes: swap the language extension. |
| Comment syntax | Language data `commentTokens: {line: "//", block: {/*, */}}` in `lang-javascript` (`index.js` line 341). Nothing in `editor.js` uses it (no `toggleComment` keymap; `defaultKeymap` binds `Mod-/` to it, so it does work). | Haskell mode sets `commentTokens: {line: "--", block: {open: "{-", close: "-}"}}` (`haskell.js` line 236), correct for PureScript. | Comes with the language extension. |
| Auto-closing brackets | None: the editor does not install `closeBrackets` (`lang-javascript` offers language data for it, `index.js` line 340, but nothing reads it). | Same. | No. |
| Autocompletion | None. | None. | No. |
| Bracket matching | `bracketMatching()`, default `()[]{}`. | Same; works for stream languages. | No. |
| Indent on Enter | `lang-javascript` has a syntax-tree indent service: indents after `{`, `(`, etc. | A stream mode without an `indent` function returns `null` (`language/dist/index.js` line 2032, `indent: spec.indent \|\| (() => null)`), and `newlineAndIndent` then **copies the previous line's leading whitespace** (`commands/dist/index.js` line 1549-1550). That is a sensible default for PureScript, since layout follows the previous line, but it will not add the extra indent after `where`, `do`, `of`, `=`, `let`. | Behaviour changes; optionally add an `indent` function to the wrapper. The player can press Tab (`indentWithTab` is installed). |
| Re-indent while typing | `indentOnInput` rule `/^\s*(?:case \|default:\|\{\|\}\|<\/)$/` from `lang-javascript` (line 342). | None for the Haskell mode, so a typed `}` or `where` is never re-indented. Fine. | No. |
| Indent unit | `indentUnit` default (2 spaces) is not set in `editor.js`. | PureScript has no mandated width; 2 spaces is common but not verified from a primary source. | No. |
| Syntax-error check | `acorn.parse` in `syntaxError(code)`. | Needs the compiler; out of this ticket's scope (the map lists it under "Syntax errors"). | Separate ticket. |

State to remember per Language when the dropdown changes the mode: swap via a `Compartment` (the editor already uses one for `mode`; a second compartment for the language is the same pattern, and `reconfigure` keeps the document, so each Language's draft can be kept in the Elm side as the map already says).

### 4. Writing a proper Lezer grammar

- Workflow (Lezer guide, "Writing a grammar" and "Build tools"): write a `.grammar` file, run `lezer-generator lang.grammar -o lang.js` offline, export a `parser`, wrap in `LRLanguage.define`. That adds a build step and a generator dev-dependency; the esbuild step in `static/default.nix` would need the generated file committed or generated in the Nix build.
- The hard part is layout. PureScript block structure comes from indentation: the compiler has a dedicated layout algorithm (`src/Language/PureScript/CST/Layout.hs`, with layout contexts `LytWhere`, `LytOf`, `LytDo`, `LytAdo`, `LytLet`, ...) that inserts virtual `{`, `;`, `}` tokens. The Lezer guide says tokens that cannot be expressed in the grammar are read by "external tokenizers" written in JavaScript, with indentation state kept in a context (its Python example). A PureScript grammar would need the same, i.e. a port of the Layout algorithm. That also yields real syntax-tree-based indent and folding.
- Estimate: days, not hours, and a maintenance burden. For highlighting 4-12 line Puzzles, the wrapped Haskell mode gives nearly the same visible result.

### 5. Licences

- Haskell mode / legacy-modes: MIT (npm `license` field).
- `@codemirror/language`, `@lezer/highlight`, `@lezer/lr`, `@lezer/javascript`: MIT (package.json files).
- PureScript compiler (source used only as a reference for the lexical rules): repository licence reported as `NOASSERTION` by the GitHub API (custom BSD-style text in `LICENSE`, "Copyright (c) 2013-17 Phil Freeman, (c) 2014-2017 Gary Burgess, and other contributors"). We copy no code from it; keyword lists are facts about the language.
- `rowtype-yoga/purescript-codemirror6`: MIT, but unrelated to highlighting.

### 6. Recommendation

Use `StreamLanguage.define` over a small wrapper around `@codemirror/legacy-modes/mode/haskell`, fixing keywords, raw strings and operator tags. Keep the editor's `HighlightStyle` unchanged. Put the language extension in a `Compartment` so the dropdown can switch it without recreating the editor. Treat a Lezer grammar as a later upgrade only if indentation-aware editing is wanted.

## Sources

- npm registry: `https://registry.npmjs.org/@codemirror/legacy-modes/latest`, `.../@codemirror/lang-javascript/latest`, search endpoint `https://registry.npmjs.org/-/v1/search?text=purescript%20codemirror` (and `lezer%20purescript`, `purescript%20syntax`).
- Package contents of `@codemirror/legacy-modes@6.5.5` (`mode/haskell.js`, `mode/elm.js`, `README.md`), `@codemirror/language@6.13.1` (`dist/index.js`), `@codemirror/commands` (`dist/index.js`), `@codemirror/lang-javascript@6.2.5` (`dist/index.js`).
- `https://github.com/rowtype-yoga/purescript-codemirror6` (`package.json`, `src/CodeMirror.purs`, `src/CodeMirror.js`).
- `https://github.com/purescript/purescript`: `src/Language/PureScript/CST/Lexer.hs`, `Layout.hs`, `Parser.y`, `LICENSE` (master at `1d4bcef2e7bb`).
- Lezer system guide: `https://lezer.codemirror.net/docs/guide/`. CodeMirror reference: `https://codemirror.net/docs/ref/#language.StreamLanguage`.
- This repo: `static/editor/src/editor.js`, `static/editor/package.json`, `static/default.nix`.

## Open points

- The sample test used a hand-written PureScript snippet, not a corpus; the Puzzle Reference Solutions in PureScript do not exist yet. Re-check colouring once ticket 02/04 give real ones.
- Bundle numbers are for a reduced entry file; the real `editor.js` also pulls `commands`, `acorn` and `storage.mjs`, so absolute sizes are higher, the deltas should hold.
- I did not search Discourse threads or other forums for unpublished grammars; only the registries and repositories above.
