// PureScript's editor mode (seam 2) and import rules (seam 3). Nothing outside
// this file names PureScript (L5). The Checker (seam 1) and the registration
// in the app's Language list are ticket 31's: it builds the Language value
// from `purescriptEditorSeams` below.
import { StreamLanguage } from "@codemirror/language";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";

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
function listedNames(list) {
  const names = [];
  let depth = 0, start = 0;
  const items = [];
  for (let i = 0; i <= list.length; i++) {
    const c = list[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," && depth === 0) || i === list.length) { items.push(list.slice(start, i)); start = i + 1; }
  }
  for (let item of items) {
    item = item.trim().replace(/^(?:class|type)\s+/, "");
    if (item === "") continue;
    const operator = /^\((.+)\)$/.exec(item);
    if (operator) { names.push(operator[1].trim()); continue; }
    const withMembers = /^([\w']+)\s*\((.*)\)$/.exec(item);
    if (withMembers) {
      names.push(withMembers[1]);
      for (const m of withMembers[2].split(",")) if (m.trim() && m.trim() !== "..") names.push(m.trim());
    } else names.push(item);
  }
  return names;
}

// The document's imports: `lines` (every import line: {from, to, text}),
// `merge` (module -> the first `import M (...)` line to merge into),
// `names` (every name a list imports), `open` (modules imported whole,
// `import M`, so everything they export is in scope).
export function readImports(doc) {
  const out = { lines: [], merge: new Map(), names: new Set(), open: new Set() };
  let from = 0;
  for (const text of doc.split("\n")) {
    const line = { from, to: from + text.length, text };
    from += text.length + 1;
    if (!/^import\s/.test(text)) continue;
    out.lines.push(line);
    const listed = /^import\s+([A-Z][\w.]*)\s*\((.*)\)\s*$/.exec(text);
    if (listed) {
      if (!out.merge.has(listed[1])) out.merge.set(listed[1], line);
      for (const n of listedNames(listed[2])) out.names.add(n);
    } else {
      const whole = /^import\s+([A-Z][\w.]*)\s*$/.exec(text);
      if (whole) out.open.add(whole[1]);
    }
  }
  return out;
}

// The name table (names.<hash>.json: {modules: {M: [[name, kind]]}, preferred:
// {name: [M, ...]}}) as what the popup searches: the names an identifier can
// be typed as (not operators), with the modules to offer for each, preferred
// module first; and the names Prelude exports, which need no import.
const indexes = new WeakMap();
export function indexNames(table) {
  let index = indexes.get(table);
  if (index) return index;
  const prelude = new Set((table.modules.Prelude ?? []).map(([name]) => name));
  const found = new Map(); // name -> Map(module -> kind)
  for (const [module, names] of Object.entries(table.modules)) {
    for (const [name, kind] of names) {
      if (kind === "operator" || kind === "typeOperator" || prelude.has(name)) continue;
      if (!found.has(name)) found.set(name, new Map());
      found.get(name).set(module, kind);
    }
  }
  const entries = [];
  for (const [name, byModule] of found) {
    // own keys only: a name like "toString" or "constructor" is not a preference
    const listed = table.preferred && Object.hasOwn(table.preferred, name) ? table.preferred[name] : [];
    const preferred = listed.filter((m) => byModule.has(m));
    const modules = preferred.length > 0 ? preferred : [...byModule.keys()].sort();
    entries.push({ name, lower: name.toLowerCase(), modules: modules.map((module) => ({ module, kind: byModule.get(module) })) });
  }
  entries.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : a.name < b.name ? -1 : 1));
  index = { entries, prelude };
  indexes.set(table, index);
  return index;
}

// What to offer for the word being typed: names (and their modules) starting
// with it, ignoring case, in alphabetical order and each name's modules in
// preference order, at most `limit`. Not offered: names Prelude exports, names
// the document already imports (from any module), names of a module it imports
// whole.
export function offers(table, doc, word, limit) {
  const have = readImports(doc);
  const prefix = word.toLowerCase();
  const out = [];
  for (const entry of indexNames(table).entries) {
    if (!entry.lower.startsWith(prefix) || have.names.has(entry.name)) continue;
    for (const { module, kind } of entry.modules) {
      if (have.open.has(module)) continue;
      out.push({ name: entry.name, module, kind });
      if (out.length === limit) return out;
    }
  }
  return out;
}

// The import edit: one change. A class is imported as `class Name`.
export function importEdit(doc, offer) {
  const item = offer.kind === "class" ? `class ${offer.name}` : offer.name;
  const have = readImports(doc);
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
