// What a PureScript library module exports, read from the library sources
// without a compiler. Two users: the import check (every imported name must be
// exported by the module it is imported from) and, with a one-off script, the
// name-clash list in languages/purescript/. Approximate by design: it reads
// export lists and `import` lines, not the whole language (see the notes on
// each function).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// * Reading text

// Source without `--` line comments and `{- -}` block comments. Strings are
// not parsed: a `--` inside a string literal in a header is not a thing.
export function stripComments(src) {
  let out = src;
  for (let prev = null; prev !== out; ) {
    prev = out;
    out = out.replace(/\{-(?!-)(?:(?!\{-|-\})[\s\S])*-\}/g, " ");
  }
  return out.replace(/--.*$/gm, "");
}

// Splits at commas outside any brackets.
export function splitTop(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

// The text between the parenthesis that opens at `open` and its partner.
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

// * Items: one entry of an export list or an import list

// {kind: "module"|"value"|"type"|"class"|"operator"|"typeOperator", name,
//  members: null | ".." | [names]}
export function parseItem(text) {
  const t = text.trim();
  let m;
  if ((m = /^module\s+([\w.]+)$/.exec(t))) return { kind: "module", name: m[1], members: null };
  if ((m = /^class\s+([A-Z]\w*)$/.exec(t))) return { kind: "class", name: m[1], members: null };
  if ((m = /^type\s+\((.+)\)$/.exec(t))) return { kind: "typeOperator", name: m[1].trim(), members: null };
  if ((m = /^\((.+)\)$/.exec(t))) return { kind: "operator", name: m[1].trim(), members: null };
  if ((m = /^([A-Z][\w']*)\s*\(([\s\S]*)\)$/.exec(t))) {
    const inner = m[2].trim();
    return { kind: "type", name: m[1], members: inner === ".." ? ".." : splitTop(inner) };
  }
  if ((m = /^([A-Z][\w']*)$/.exec(t))) return { kind: "type", name: m[1], members: null };
  if ((m = /^([a-z_][\w']*)$/.exec(t))) return { kind: "value", name: m[1], members: null };
  return null;
}

// * Reading a module

// {name, exportItems: [item] | null (no export list), imports: [module names],
//  src} from a module's text; null if it has no `module` header.
export function parseModule(text) {
  const src = stripComments(text);
  const header = /^module\s+([\w.]+)/m.exec(src);
  if (!header) return null;
  const after = src.slice(header.index + header[0].length);
  const open = /^\s*\(/.exec(after);
  const exportItems = open ? splitTop(balanced(after, open[0].length - 1) ?? "").map(parseItem).filter(Boolean) : null;
  const imports = [...src.matchAll(/^import\s+([A-Z][\w.]*)/gm)].map((m) => m[1]);
  return { name: header[1], exportItems, imports, src };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Is `item` declared in this module's own text (not just imported)?
function declaredHere(module, item) {
  const n = esc(item.name);
  const patterns = {
    value: `^(?:foreign import\\s+)?${n}\\s*::`,
    operator: `^infix[lr]?\\s+\\d+\\s+\\S+\\s+as\\s+${n}\\s*$`,
    typeOperator: `^infix[lr]?\\s+\\d+\\s+type\\s+\\S+\\s+as\\s+${n}\\s*$`,
    type: `^(?:data|newtype|type|foreign import data)\\s+${n}\\b`,
    class: `^class\\s+(?:[^\\n]*=>\\s*)?${n}\\b`,
  };
  return new RegExp(patterns[item.kind], "m").test(module.src);
}

// The key a name is exported and imported under; types and values do not
// clash with each other, operators and type operators neither.
export const keyOf = (item) => `${item.kind === "type" || item.kind === "class" ? "type" : item.kind === "typeOperator" ? "typeOperator" : item.kind === "operator" ? "operator" : "value"}:${item.name}`;

// Every top-level declaration of a module, as export items: what a module
// with no export list exports. Class methods (indented `name ::` lines in a
// class body) are included; a data type or newtype is exported with all its
// constructors (`..`), as a module without an export list does.
function declarations(module) {
  const items = [];
  let inClass = false;
  for (const line of module.src.split(/\r?\n/)) {
    let m;
    if (/^\S/.test(line)) inClass = false;
    if ((m = /^(?:foreign import\s+)?([a-z_][\w']*)\s*::/.exec(line))) items.push({ kind: "value", name: m[1], members: null });
    else if ((m = /^(data|newtype)\s+([A-Z][\w']*)/.exec(line))) items.push({ kind: "type", name: m[2], members: ".." });
    else if ((m = /^(?:type|foreign import data)\s+([A-Z][\w']*)/.exec(line))) items.push({ kind: "type", name: m[1], members: null });
    else if ((m = /^class\s+(?:[^\n]*=>\s*)?([A-Z][\w']*)/.exec(line))) {
      items.push({ kind: "type", name: m[1], members: null });
      inClass = true;
    } else if ((m = /^infix[lr]?\s+\d+\s+type\s+\S+\s+as\s+(\S+)\s*$/.exec(line))) items.push({ kind: "typeOperator", name: m[1], members: null });
    else if ((m = /^infix[lr]?\s+\d+\s+\S+\s+as\s+(\S+)\s*$/.exec(line))) items.push({ kind: "operator", name: m[1], members: null });
    else if (inClass && (m = /^\s+([a-z_][\w']*)\s*::/.exec(line))) items.push({ kind: "value", name: m[1], members: null });
  }
  return items;
}

// The constructors a `data` or `newtype` declaration in this module gives
// the type `name` (in order), [] for a type synonym, a foreign type, a class,
// or a type this module does not declare. Reads the text after the `=` up to
// the end of the declaration (the lines indented under it), split at the `|`
// outside any brackets.
export function constructorsDeclared(module, name) {
  // (a kind signature, `data Proxy :: k -> Type`, comes first and has no `=`)
  const found = module.src.matchAll(new RegExp(`^(?:data|newtype)\\s+${esc(name)}\\b[^\\n]*(?:\\n[ \\t]+[^\\n]*)*`, "gm"));
  const body = [...found].map((m) => m[0]).find((text) => text.includes("="));
  if (body === undefined) return [];
  const eq = body.indexOf("=");
  const out = [];
  let depth = 0;
  let from = eq + 1;
  for (let i = eq + 1; i <= body.length; i++) {
    const c = body[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if ((c === "|" && depth === 0) || i === body.length) {
      const ctor = /^\s*([A-Z][\w']*)/.exec(body.slice(from, i));
      if (ctor) out.push(ctor[1]);
      from = i + 1;
    }
  }
  return out;
}

// * A set of library modules

// Reads `<libs>/<library>/src/**/*.purs` into a Library set:
// {modules: Map moduleName -> {library, parsed}}.
export function readLibraries(libsPath, only) {
  const modules = new Map();
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  for (const lib of readdirSync(libsPath, { withFileTypes: true })) {
    if (!(lib.isDirectory() || lib.isSymbolicLink()) || (only && !only.includes(lib.name))) continue;
    const src = join(libsPath, lib.name, "src");
    if (!existsSync(src)) continue;
    for (const file of walk(src).filter((f) => f.endsWith(".purs"))) {
      const parsed = parseModule(readFileSync(file, "utf8"));
      if (parsed) modules.set(parsed.name, { library: lib.name, parsed });
    }
  }
  return { modules };
}

// What `moduleName` exports: Map key -> {name, kind, origin} where `origin` is
// the module that declares the name (so a re-export has the same origin as the
// original). Returns null for a module with no export list or not in the set.
// Approximations: a re-exported `module Y` brings all of Y's exports; a named
// export that is not declared in the module is looked up in its imports; the
// constructors of a type exported as `T(..)` are read from the declaring
// module (`constructorsDeclared`), a `T(A, B)` lists its own; each type entry
// carries `constructors` (the names it exports, [] when none), each
// constructor an entry of kind "constructor" with `type` (its type's name).
export function exportsOf(libs, moduleName, seen = new Set()) {
  const cache = (libs.exportsCache ??= new Map());
  if (cache.has(moduleName)) return cache.get(moduleName);
  const entry = libs.modules.get(moduleName);
  if (!entry || seen.has(moduleName)) return null;
  const { parsed } = entry;
  const out = new Map();
  const nextSeen = new Set(seen).add(moduleName);
  for (const item of parsed.exportItems ?? declarations(parsed)) {
    if (item.kind === "module") {
      if (item.name === moduleName) continue;
      for (const [k, v] of exportsOf(libs, item.name, nextSeen) ?? []) out.set(k, v);
      continue;
    }
    let origin = moduleName;
    if (!declaredHere(parsed, item)) {
      for (const imp of parsed.imports) {
        const found = exportsOf(libs, imp, nextSeen)?.get(keyOf(item));
        if (found) {
          origin = found.origin;
          break;
        }
      }
    }
    let constructors = [];
    if (item.kind === "type" && item.members === "..") constructors = constructorsDeclared(libs.modules.get(origin)?.parsed ?? parsed, item.name);
    else if (Array.isArray(item.members)) constructors = item.members;
    out.set(keyOf(item), { name: item.name, kind: item.kind, origin, constructors, all: item.members === ".." });
    for (const member of constructors) out.set(`value:${member}`, { name: member, kind: "constructor", origin, type: item.name });
  }
  cache.set(moduleName, out);
  return out;
}

// The rows the import popup's name table keeps for one module's exports (what
// `exportsOf` gave): [name, kind] with kind value, type, class, operator or
// typeOperator, as before; a type that exports all its constructors (`T(..)`)
// has kind "data", and each of its constructors a row [name, "constructor",
// type name]. A type that exports only some constructors has no constructor
// rows (importing it as `T(..)` would ask for more than the module gives).
export function nameRows(exported) {
  const rows = [];
  for (const e of exported.values()) {
    if (e.kind === "constructor") {
      if (exported.get(`type:${e.type}`)?.all) rows.push([e.name, "constructor", e.type]);
    } else rows.push([e.name, e.kind === "type" && e.all && e.constructors.length > 0 ? "data" : e.kind]);
  }
  return rows;
}

// * Checking an import line against the exports

// Parses a one-line import: {module, items: [item] | null} or null.
export function parseImportLine(line) {
  const m = /^import\s+([A-Z][\w.]*)(?:\s*\((.*)\))?\s*$/.exec(line.trim());
  if (!m) return null;
  return { module: m[1], items: m[2] === undefined ? null : splitTop(m[2]).map(parseItem) };
}

// Problems for the names one import line asks for, against the exports of the
// module in `libs`. A module whose exports cannot be read (no export list) is
// not checked. `items` entries that did not parse are reported.
export function importNameProblems(libs, imp, where) {
  if (!imp.items) return [];
  const exported = exportsOf(libs, imp.module);
  if (!exported) return [];
  const problems = [];
  for (const item of imp.items) {
    if (!item) {
      problems.push(`${where}: cannot read an item of the import list from ${imp.module}`);
      continue;
    }
    const found = exported.get(keyOf(item));
    if (!found) {
      const shown = item.kind === "operator" ? `(${item.name})` : item.kind === "typeOperator" ? `type (${item.name})` : item.name;
      problems.push(`${where}: ${imp.module} does not export ${shown}`);
    } else if (item.kind === "type" && item.members !== null) {
      // `T(..)` needs T to have constructors there; `T(A, B)` each of A and B.
      const have = found.constructors ?? [];
      if (item.members === "..") {
        if (have.length === 0) problems.push(`${where}: ${imp.module} exports ${item.name} without constructors, so ${item.name}(..) is not allowed`);
      } else {
        for (const member of item.members) {
          if (!have.includes(member)) problems.push(`${where}: ${imp.module} does not export a constructor ${member} of ${item.name}`);
        }
      }
    }
  }
  return problems;
}
