// PureScript, a Language: the value the registry lists (languages.mjs) with its
// four seams. Its Checker is purescript/check.mjs, its editor mode and import
// rules are in this file, its bundle is purescript/loader.mjs. Nothing outside
// this file and purescript/ names PureScript (L5).
import { StreamLanguage } from "@codemirror/language";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { createBundle } from "../../../bundle/bundle.mjs";
import { createLoader } from "./purescript/loader.mjs";
import { createPurescriptChecker } from "./purescript/check.mjs";

// --- Editor mode: the bundled Haskell mode, with PureScript's differences ---

const KEYWORDS = new Set(["forall", "ado", "derive"]);
const BOOLEANS = new Set(["true", "false"]);
const OPERATOR = /^[-!#$%&*+.\/<=>?@\\^|~:]+$/;
// A line ending in one of these opens a block, so the next line indents.
const OPENS_BLOCK = /(?:\b(?:where|do|ado|of|let|then|else)|=|->|<-|\\)\s*$/;

function purescriptToken(stream, state) {
  if (state.raw || stream.match('"""')) { // a """ raw string, which may span lines
    state.raw = true;
    while (!stream.eol()) if (stream.match('"""')) { state.raw = false; break; } else stream.next();
    return "string";
  }
  const tag = haskell.token(stream, state.inner);
  const word = stream.current();
  if (KEYWORDS.has(word)) return "keyword";
  if (BOOLEANS.has(word)) return "bool";
  if ((tag === "variable" || tag === "builtin") && OPERATOR.test(word)) return "operator";
  return tag;
}

// A new line indents like the last non-blank line before it, one more unit
// after a line that opens a block. (On Enter, "before it" includes the text of
// the line being broken, up to the cursor.)
function purescriptIndent(_state, _textAfter, context) {
  const doc = context.state.doc;
  const here = doc.lineAt(context.pos);
  const breaking = context.options.simulateBreak === context.pos;
  for (let n = breaking ? here.number : here.number - 1; n >= 1; n--) {
    const line = doc.line(n);
    const text = n === here.number ? doc.sliceString(line.from, context.pos) : line.text;
    if (text.trim() === "") continue;
    return /^\s*/.exec(text)[0].length + (OPENS_BLOCK.test(text.replace(/--.*$/, "")) ? context.unit : 0);
  }
  return 0;
}

export const purescriptLanguage = StreamLanguage.define({
  name: "purescript",
  startState: () => ({ inner: haskell.startState(), raw: false }),
  copyState: (s) => ({ inner: haskell.copyState(s.inner), raw: s.raw }),
  token: purescriptToken,
  indent: purescriptIndent,
  languageData: haskell.languageData,
});

export const purescriptMode = () => purescriptLanguage;

// --- Import rules ------------------------------------------------------------

export const isImportLine = (text) => /^\s*import\b/.test(text);

// The names a one-line import's list brings in: "Maybe(..), class Show,
// (<>), fromMaybe" gives Maybe, Show, <>, fromMaybe (and listed constructors).
// The items of a list, with where each is in it: [{from, to, text}] (`text`
// trimmed, from and to its place in `list`), split at commas outside brackets.
function listItems(list) {
  const items = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= list.length; i++) {
    const c = list[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," && depth === 0) || i === list.length) {
      const raw = list.slice(start, i);
      const text = raw.trim();
      if (text !== "") items.push({ from: start + raw.indexOf(text), to: start + raw.indexOf(text) + text.length, text });
      start = i + 1;
    }
  }
  return items;
}

// `wide` gets the types listed with all their constructors, `T(..)`.
function listedNames(list, wide = new Set()) {
  const names = [];
  for (let { text: item } of listItems(list)) {
    item = item.replace(/^(?:class|type)\s+/, "");
    if (item === "") continue;
    const operator = /^\((.+)\)$/.exec(item);
    if (operator) { names.push(operator[1].trim()); continue; }
    const withMembers = /^([\w']+)\s*\((.*)\)$/.exec(item);
    if (withMembers) {
      names.push(withMembers[1]);
      if (withMembers[2].trim() === "..") wide.add(withMembers[1]);
      for (const m of withMembers[2].split(",")) if (m.trim() && m.trim() !== "..") names.push(m.trim());
    } else names.push(item);
  }
  return names;
}

// The document's imports: `lines` (every import line: {from, to, text}),
// `merge` (module -> the first `import M (...)` line to merge into),
// `listed` (module -> every `import M (...)` line of it), `names` (every name a
// list imports), `wide` (the types a list imports with `(..)`), `open` (modules imported whole,
// `import M`, so everything they export is in scope).
export function readImports(doc) {
  const out = { lines: [], merge: new Map(), listed: new Map(), names: new Set(), wide: new Set(), open: new Set() };
  let from = 0;
  for (const text of doc.split("\n")) {
    const line = { from, to: from + text.length, text };
    from += text.length + 1;
    if (!/^import\s/.test(text)) continue;
    out.lines.push(line);
    const listed = /^import\s+([A-Z][\w.]*)\s*\((.*)\)\s*$/.exec(text);
    if (listed) {
      if (!out.merge.has(listed[1])) out.merge.set(listed[1], line);
      if (!out.listed.has(listed[1])) out.listed.set(listed[1], []);
      out.listed.get(listed[1]).push(line);
      for (const n of listedNames(listed[2], out.wide)) out.names.add(n);
    } else {
      const whole = /^import\s+([A-Z][\w.]*)\s*$/.exec(text);
      if (whole) out.open.add(whole[1]);
    }
  }
  return out;
}

// The name table (names.<hash>.json: {modules: {M: [[name, kind]]}, preferred:
// {name: [M, ...]}}; a row is [name, kind] or, for a constructor, [name,
// "constructor", its type's name]; a type that has constructors has kind
// "data") as what the popup searches: the names an identifier can
// be typed as (not operators), with the modules to offer for each, preferred
// module first; and the names Prelude exports, which need no import.
const indexes = new WeakMap();
export function indexNames(table) {
  let index = indexes.get(table);
  if (index) return index;
  const prelude = new Set((table.modules.Prelude ?? []).map(([name]) => name));
  const found = new Map(); // name -> Map(module -> kind)
  for (const [module, names] of Object.entries(table.modules)) {
    for (const [name, kind, owner] of names) {
      if (kind === "operator" || kind === "typeOperator" || prelude.has(name)) continue;
      if (!found.has(name)) found.set(name, new Map());
      const byModule = found.get(name);
      // a type and its constructor can share a name (Tuple); both are imported as `Tuple(..)`
      if (kind === "constructor") byModule.set(module, { kind, type: owner });
      else if (!byModule.has(module) || kind === "data") byModule.set(module, { kind, type: kind === "data" ? name : undefined });
    }
  }
  const entries = [];
  for (const [name, byModule] of found) {
    // own keys only: a name like "toString" or "constructor" is not a preference
    const listed = table.preferred && Object.hasOwn(table.preferred, name) ? table.preferred[name] : [];
    const preferred = listed.filter((m) => byModule.has(m));
    const modules = preferred.length > 0 ? preferred : [...byModule.keys()].sort();
    entries.push({ name, lower: name.toLowerCase(), modules: modules.map((module) => ({ module, ...byModule.get(module) })) });
  }
  entries.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : a.name < b.name ? -1 : 1));
  index = { entries, prelude };
  indexes.set(table, index);
  return index;
}

// What to offer for the word being typed: names (and their modules) starting
// with it, ignoring case, in alphabetical order and each name's modules in
// preference order, at most `limit`. A constructor is offered with its module
// (`Just` from Data.Maybe), a type with constructors as itself (`Maybe`):
// accepting either imports the type with all its constructors. Not offered:
// names Prelude exports, names the document already imports (from any
// module), constructors of a type it imports as `T(..)`, names of a module it
// imports whole.
export function offers(table, doc, word, limit) {
  const have = readImports(doc);
  const prefix = word.toLowerCase();
  const out = [];
  for (const entry of indexNames(table).entries) {
    if (!entry.lower.startsWith(prefix) || have.names.has(entry.name)) continue;
    for (const { module, kind, type } of entry.modules) {
      if (have.open.has(module) || (kind === "constructor" && have.wide.has(type))) continue;
      out.push(type === undefined ? { name: entry.name, module, kind } : { name: entry.name, module, kind, type });
      if (out.length === limit) return out;
    }
  }
  return out;
}

// The import edit: one change. A class is imported as `class Name`; a
// constructor or a type with constructors as `Type(..)`, which replaces the
// type's own entry when the module's list already has it bare (`Maybe`) or
// with some constructors (`Maybe(Just)`).
export function importEdit(doc, offer) {
  const type = offer.kind === "constructor" ? offer.type : offer.kind === "data" ? offer.name : null;
  const item = type !== null ? `${type}(..)` : offer.kind === "class" ? `class ${offer.name}` : offer.name;
  const have = readImports(doc);
  if (type !== null) {
    for (const line of have.listed.get(offer.module) ?? []) {
      const open = line.text.indexOf("(");
      const close = line.text.lastIndexOf(")");
      for (const found of listItems(line.text.slice(open + 1, close))) {
        if (new RegExp(`^${type}\\s*(?:\\(.*\\))?$`).test(found.text)) {
          return { from: line.from + open + 1 + found.from, to: line.from + open + 1 + found.to, insert: item };
        }
      }
    }
  }
  const merge = have.merge.get(offer.module);
  if (merge) {
    // before the closing ")", after the last thing in the list
    const close = merge.text.lastIndexOf(")");
    const inner = merge.text.slice(0, close).trimEnd();
    const empty = /\(\s*$/.test(inner);
    return { from: merge.from + inner.length, to: merge.from + close, insert: (empty ? "" : ", ") + item };
  }
  const line = `import ${offer.module} (${item})`;
  if (have.lines.length > 0) {
    const last = have.lines[have.lines.length - 1];
    return { from: last.to, insert: "\n" + line };
  }
  return { from: 0, insert: line + "\n\n" };
}

// The Language's import rules (see languages.mjs). `loadNames` gives the name
// table's JSON text or object; it is asked for lazily, once it has succeeded.
export function purescriptImportRules({ loadNames }) {
  let loaded = null;
  return {
    names() {
      loaded ??= Promise.resolve(loadNames())
        .then((t) => (typeof t === "string" ? JSON.parse(t) : t))
        .catch((err) => { loaded = null; throw err; });
      return loaded;
    },
    isImportLine,
    offers,
    importEdit,
  };
}

// The name table from the Language's bundle (static/bundle/bundle.mjs): the
// `names` core file the build writes.
export function namesFromBundle(bundle) {
  return async () => new TextDecoder().decode(await bundle.core("names"));
}

// What ticket 31 spreads into the Language value, with the bundle's loader.
export function purescriptEditorSeams({ loadNames }) {
  return { editorMode: purescriptMode, importRules: purescriptImportRules({ loadNames }) };
}

// --- The Language -------------------------------------------------------------

const COMPILE_TIMEOUT_MS = 5000; // languages/purescript/language.json: timeouts.compileMs
const RUN_TIMEOUT_MS = 1000;     // timeouts.runMs

// One loader per page, made on first use: the bundle is addressed relative to
// the page's own <base> (`purs/current.json`; the site exports it there).
let loader = null;
function pageLoader() {
  return (loader ??= createLoader({ createBundle, entry: "purs/current.json", base: globalThis.document?.baseURI, cacheName: "purs-bundle" }));
}

// The name table, read from the bundle without waiting for the compiler.
const bundleFacade = { core: (name) => pageLoader().bundle.core(name) };

// The scripts beside the runner script `url` (static/src/js/): the compiler
// worker and the sandbox's runner.
const sibling = (url, name) => new URL(name, new URL(url, globalThis.location?.href ?? "http://localhost/")).href;

export const purescript = {
  name: "purescript",
  title: "PureScript",
  folder: "languages/purescript",
  settings: { runTimeoutMs: RUN_TIMEOUT_MS, compileTimeoutMs: COMPILE_TIMEOUT_MS },
  // Seam 1. `env` is {Worker, url}, `url` being the address of the JavaScript
  // runner script; the compiler worker and the PureScript runner sit beside it.
  createChecker: ({ Worker, url }) => createPurescriptChecker({
    Worker,
    compilerUrl: sibling(url, "purs-compiler.js"),
    sandboxUrl: sibling(url, "purs-sandbox.js"),
    loader: pageLoader(),
    limits: { compileMs: COMPILE_TIMEOUT_MS, runMs: RUN_TIMEOUT_MS },
  }),
  // Seams 2 and 3.
  ...purescriptEditorSeams({ loadNames: namesFromBundle(bundleFacade) }),
  // The Checker preloads the Puzzle's libraries (check.mjs, warmUp).
  canWarmUp: true,
  // The lazy download; static/bundle/trigger.mjs decides when it starts.
  bundle: { start: (options) => pageLoader().start(options) },
};
