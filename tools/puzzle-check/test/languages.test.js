// Tests for the languages/<name>/ folders and the check reading them: limits,
// symbols and coverage tables come from the folders, a third Language is just
// a third folder, the pinned list and the import name check, the prompt lint.
// Fixture trees are built in a temporary folder.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defaultLanguagesDir, languageNamed, loadLanguages } from "../languages.js";
import { checkBank, promptProblems, symbolCounts } from "../puzzle-check.js";
import { exportsOf, importNameProblems, nameRows, parseImportLine, readLibraries } from "../purs-exports.js";
import { importLint, libsFolder, loadPinned, pinnedDrift } from "../purs-imports.js";

const here = dirname(fileURLToPath(import.meta.url));
const checkJs = join(here, "..", "check.js");
const run = promisify(execFile);
const scratch = mkdtempSync(join(tmpdir(), "puzzle-check-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
// A copy of the repo's languages/ folder to change.
const languagesCopy = () => {
  const dir = fresh("languages");
  cpSync(defaultLanguagesDir, dir, { recursive: true });
  return dir;
};
const editJson = (file, change) => {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  change(doc);
  writeFileSync(file, JSON.stringify(doc, null, 2));
};
const passingToml = readFileSync(join(here, "fixtures", "passing", "double.toml"), "utf8");
// A folder holding one Puzzle file, `double.toml`, with extra text appended.
const bankWith = (extra = "", transform = (t) => t) => {
  const dir = fresh("bank");
  writeFileSync(join(dir, "double.toml"), transform(passingToml) + extra);
  return dir;
};
const psWith = (reference) => (t) => t.replace(/\[purescript\][\s\S]*$/, `[purescript]\nsignature = '''\ndouble :: Int -> Int\ndouble x = ...'''\nreference = '''\n${reference}'''\n`);
const noLibs = { PURS_LIBS: "" };
const withoutLibs = (env = {}) => ({ ...process.env, PURS_LIBS: "", ...env });

// * The folders

test("the repo's languages are read from languages/<name>/language.json", () => {
  const [js, ps] = loadLanguages();
  assert.deepEqual([js.name, ps.name], ["javascript", "purescript"]);
  assert.deepEqual(js.limits, { minLines: 4, maxLines: 12, minChars: 100, maxChars: 350 });
  assert.deepEqual(ps.limits, { minLines: 4, maxLines: 30, minChars: 100, maxChars: 900 });
  assert.equal(js.importLine, null);
  assert.ok(ps.importLine.test("import Prelude"));
  assert.ok(ps.symbols.includes("#") && !ps.symbols.includes("%"));
  assert.ok(js.symbols.includes("%") && !js.symbols.includes("#"));
});

test("a language.json with a wrong or missing field is an error naming the folder", () => {
  const dir = languagesCopy();
  editJson(join(dir, "javascript", "language.json"), (d) => {
    d.limits.maxLines = 1;
    delete d.symbols;
  });
  assert.throws(() => loadLanguages(dir), /javascript\/language\.json: .*limits.*symbols/);
  editJson(join(dir, "javascript", "language.json"), (d) => (d.name = "js"));
  assert.throws(() => loadLanguages(dir), /name \(must be "javascript"/);
});

// * Limits and symbols come from the folders

test("changing a limit in a language folder changes what the check does", async () => {
  const bank = bankWith();
  const same = await checkBank(bank, { languagesDir: defaultLanguagesDir, libs: "" });
  assert.deepEqual(same.failures, []);
  const dir = languagesCopy();
  editJson(join(dir, "javascript", "language.json"), (d) => (d.limits = { ...d.limits, minLines: 1, maxLines: 3 }));
  const { ok, failures } = await checkBank(bank, { languagesDir: dir, libs: "" });
  assert.equal(ok, false);
  assert.deepEqual(failures[0].problems, ["JavaScript Reference Solution has 5 non-blank lines; it must have 1–3"]);
});

test("changing the symbol list in a language folder changes the coverage table", async () => {
  const dir = languagesCopy();
  editJson(join(dir, "purescript", "language.json"), (d) => (d.symbols = "@~"));
  const { report } = await checkBank(bankWith(), { languagesDir: dir, libs: "" });
  const ps = report.slice(report.indexOf("Target symbols, purescript"));
  assert.match(ps, /\n  @ +0 +0 +<- in fewer than 5\n  ~ +0 +0/);
  assert.doesNotMatch(ps, /\n  # /);
  assert.deepEqual(symbolCounts(["a@b@"], { ...languageNamed("javascript"), symbols: [..."@"] }), [{ symbol: "@", occurrences: 2, solutions: 1 }]);
});

// * A third Language needs no change to the check

const ruby = (dir, limits = { minLines: 2, maxLines: 3, minChars: 10, maxChars: 60 }) => {
  mkdirSync(join(dir, "ruby"));
  writeFileSync(
    join(dir, "ruby", "language.json"),
    JSON.stringify({
      name: "ruby",
      title: "Ruby",
      limits,
      imports: { linePattern: "^\\s*require\\b" },
      symbols: "@%|",
      timeouts: { compileMs: null, runMs: 1000 },
    }),
  );
};
const rubyTable = (reference) => `\n[ruby]\nsignature = "def double(x)"\nreference = '''\n${reference}'''\n`;
const okRuby = "require 'set'\nrequire 'json'\ndef double(x)\n  x * 2 | 0\nend\n";

test("a third Language folder: the check reads its Puzzle table, enforces its limits and prints its coverage table", async () => {
  const dir = languagesCopy();
  ruby(dir);
  const good = await checkBank(bankWith(rubyTable(okRuby)), { languagesDir: dir, libs: "" });
  assert.deepEqual(good.failures, []);
  assert.match(good.report, /Target symbols, ruby, over 1 Reference Solution\(s\)/);
  assert.match(good.report, /\n  \| +1 +1 +<- in fewer than 5/); // require lines are not counted, the `|` is
  assert.match(good.report, /\n  @ +0 +0/);

  // Its lines limit (imports excluded) and its characters limit are enforced.
  const tooLong = "require 'x'\ndef double(x)\n  y = x\n  y = y * 2\n  y\nend\n";
  const long = await checkBank(bankWith(rubyTable(tooLong)), { languagesDir: dir, libs: "" });
  assert.deepEqual(long.failures[0].problems, ["Ruby Reference Solution has 5 non-blank lines; it must have 2–3"]);
  const short = await checkBank(bankWith(rubyTable("x\ny\n")), { languagesDir: dir, libs: "" });
  assert.match(short.failures[0].problems[0], /^Ruby Reference Solution has 2 characters .* it must have 10–60$/);

  // A Puzzle file without the new Language's table fails; the table is unknown without the folder.
  const missing = await checkBank(bankWith(), { languagesDir: dir, libs: "" });
  assert.deepEqual(missing.failures[0].problems, ["missing table: [ruby] (every Puzzle needs a Solution in every Language)"]);
  const unknown = await checkBank(bankWith(rubyTable(okRuby)), { libs: "" });
  assert.deepEqual(unknown.failures[0].problems, ["unexpected key: ruby in <top-level>"]);
});

test("the command prints the third Language's table with --languages", async () => {
  const dir = languagesCopy();
  ruby(dir);
  const { stdout } = await run(process.execPath, [checkJs, bankWith(rubyTable(okRuby)), `--languages=${dir}`], { env: withoutLibs() });
  assert.match(stdout, /Target symbols, ruby, over 1 Reference Solution\(s\)/);
  assert.match(stdout, /OK: all 1 Puzzle file\(s\) pass\./);
  const bad = bankWith(rubyTable("x\ny\n"));
  await assert.rejects(run(process.execPath, [checkJs, bad, `--languages=${dir}`], { env: withoutLibs() }), (err) => {
    assert.match(err.stderr, /Ruby Reference Solution has 2 characters/);
    return true;
  });
});

// * The pinned list

test("the pinned list is committed: 40 libraries of one package set, each with its modules", () => {
  const pinned = loadPinned(languageNamed("purescript"));
  assert.equal(pinned.packageSet, "psc-0.15.16-20261104");
  assert.equal(pinned.libraries.length, 40);
  assert.equal(pinned.libraryOf.get("Data.Array"), "arrays");
  assert.equal(pinned.libraryOf.get("Type.Proxy"), "prelude");
  assert.ok(pinned.libraries.every((l) => /^[0-9a-f]{40}$/.test(l.commit) && /^v\d/.test(l.version)));
});

const importing = (line) =>
  psWith(`import Prelude\n${line}\n\ndouble :: Int -> Int\ndouble x = twice\n  where\n    -- Doubles its argument, then returns it to the caller.\n    twice = x * 2\n`);

test("an import from a library off the pinned list fails from the committed file, with PURS_LIBS unset", async () => {
  const bank = bankWith("", importing("import Data.Fake.Missing (nothing)"));
  await assert.rejects(run(process.execPath, [checkJs, bank], { env: withoutLibs() }), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /^FAIL double\.toml \(Puzzle double\)\n  line 2: Data\.Fake\.Missing is not in a pinned library\n$/);
    return true;
  });
  // A real library that is not pinned, too (`aff` is in the package set).
  const off = await checkBank(bankWith("", importing("import Effect.Aff (launchAff)")), { libs: "" });
  assert.deepEqual(off.failures[0].problems, ["line 2: Effect.Aff is not in a pinned library"]);
});

test("the pinned list is the committed file: removing a library from it rejects its modules", async () => {
  const dir = languagesCopy();
  editJson(join(dir, "purescript", "packages.json"), (d) => (d.libraries = d.libraries.filter((l) => l.name !== "arrays")));
  const bank = bankWith("", importing("import Data.Array (cons)"));
  assert.deepEqual((await checkBank(bank, { languagesDir: defaultLanguagesDir, libs: "" })).failures, []);
  const { failures } = await checkBank(bank, { languagesDir: dir, libs: "" });
  assert.deepEqual(failures[0].problems, ["line 2: Data.Array is not in a pinned library"]);
});

test("imports must be one line; Prim modules are built in", () => {
  const ps = languageNamed("purescript");
  const lint = (code) => importLint(code, ps, { libs: "" }).problems;
  assert.deepEqual(lint("import Prelude\nimport Prim.Row (class Union)\nimport Data.Maybe (Maybe(..), maybe)"), []);
  assert.match(lint("import Data.Array as A")[0], /^line 1: only one-line imports are allowed/);
  assert.match(lint("import Data.Array (cons,\n  snoc)")[0], /^line 1: only one-line imports/);
  assert.match(lint("import Data.Array hiding (cons)")[0], /^line 1: only one-line imports/);
  assert.match(lint("import Data.Maybe (Maybe(..), maybe)\nimport qualified Data.Array (cons)")[0], /^line 2: only one-line imports/);
});

test("without library sources the result says that names were not checked", async () => {
  const ps = languageNamed("purescript");
  const { problems, notes } = importLint("import Data.Array (noSuchName)", ps, { libs: "" });
  assert.deepEqual(problems, []);
  assert.match(notes[0], /names not checked against the library sources \(set PURS_LIBS/);
  const { notes: bankNotes } = await checkBank(bankWith(), { libs: "" });
  assert.match(bankNotes[0], /set PURS_LIBS/);
  const { stdout } = await run(process.execPath, [checkJs, bankWith()], { env: withoutLibs() });
  assert.match(stdout, /\nNote: PureScript imports: names not checked against the library sources/);
  assert.equal(libsFolder(""), null);
});

// * The name check, on a small library tree (no compiler, no download)

const miniLibs = () => {
  const root = fresh("minilibs");
  const write = (lib, module, text) => {
    const file = join(root, lib, "src", ...module.split("."));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + ".purs", text);
  };
  write("base", "Base.Core", "module Base.Core where\n\nimport Data.Unit\n\ndata Box a = Box a | Empty\n\nopen :: forall a. Box a -> a\nopen (Box a) = a\n\nclass Show a where\n  render :: a -> String\n\ninfixr 5 append as <+>\n\ntype Alias = Int\n");
  write("base", "Base.Util", "-- | comment ( with parens\nmodule Base.Util\n  ( keep -- inline comment\n  , Pair(..)\n  , Tag(Red, Blue)\n  , class Named\n  , (<->)\n  , type (~>)\n  , module Base.Core\n  ) where\n\nimport Base.Core\n\nkeep :: Int -> Int\nkeep x = x\n\ndata Pair a b = Pair a b\ndata Tag = Red | Blue | Green\nclass Named a where\n  nameOf :: a -> String\ninfix 4 keep as <->\ninfixr 4 type Pair as ~>\nhidden :: Int\nhidden = 1\n");
  write("base", "Base.Reexport", "module Base.Reexport (keep, open) where\n\nimport Base.Util (keep)\nimport Base.Core (open)\n");
  write("base", "Base.Abstract", "module Base.Abstract (Secret, Alias, Via(..), Multi(..), Kinded(..)) where\n\nimport Base.Core\n\ndata Secret = Secret Int\ntype Alias = Int\ndata Kinded :: forall k. k -> Type\ndata Kinded a = Kinded\nnewtype Via = Via { inner :: Int }\ndata Multi\n  = One (Box Int)\n  | Two { a :: Int, b :: Int }\n  | Three\n");
  write("base", "Base.Via", "module Base.Via (Box(..)) where\n\nimport Base.Core\n");
  return readLibraries(root);
};
const names = (libs, line) => importNameProblems(libs, parseImportLine(line), "line 1");

test("the export reader: explicit lists, no lists, re-exports, operators, classes, types", () => {
  const libs = miniLibs();
  const keys = (m) => [...exportsOf(libs, m).keys()].sort();
  assert.deepEqual(keys("Base.Core"), ["operator:<+>", "type:Alias", "type:Box", "type:Show", "value:Box", "value:Empty", "value:open", "value:render"]);
  assert.deepEqual(keys("Base.Util"), [
    "operator:<+>", "operator:<->", "type:Alias", "type:Box", "type:Named", "type:Pair", "type:Show", "type:Tag",
    "typeOperator:~>", "value:Blue", "value:Box", "value:Empty", "value:Pair", "value:Red", "value:keep", "value:open", "value:render",
  ]);
  assert.equal(exportsOf(libs, "Base.Util").has("value:hidden"), false);
  // A re-export keeps the original's origin, so it is not a second thing.
  assert.equal(exportsOf(libs, "Base.Reexport").get("value:open").origin, "Base.Core");
  assert.equal(exportsOf(libs, "Base.Util").get("value:open").origin, "Base.Core");
  assert.equal(exportsOf(libs, "Nope"), null);
});

test("imported names must be exported by the module they are imported from", () => {
  const libs = miniLibs();
  assert.deepEqual(names(libs, "import Base.Util (keep, Pair(..), Tag(..), class Named, (<->), type (~>), open, (<+>))"), []);
  assert.deepEqual(names(libs, "import Base.Core (open, Box(..), class Show, render)"), []);
  assert.deepEqual(names(libs, "import Base.Util (keep, hidden)"), ["line 1: Base.Util does not export hidden"]);
  assert.deepEqual(names(libs, "import Base.Core (Pair(..))"), ["line 1: Base.Core does not export Pair"]);
  assert.deepEqual(names(libs, "import Base.Core ((<->))"), ["line 1: Base.Core does not export (<->)"]);
  assert.deepEqual(names(libs, "import Base.Util (open, nothing, Missing)"), ["line 1: Base.Util does not export nothing", "line 1: Base.Util does not export Missing"]);
  assert.deepEqual(names(libs, "import Base.Util"), []); // an open import names nothing
  assert.deepEqual(names(libs, "import Elsewhere (anything)"), []); // not in the set: not checked here
});

test("constructors: read from the declaring module for T(..), listed for T(A, B), none for an abstract type or a synonym", () => {
  const libs = miniLibs();
  const entry = (m, key) => exportsOf(libs, m).get(key);
  assert.deepEqual(entry("Base.Core", "type:Box").constructors, ["Box", "Empty"]); // no export list: all of them
  assert.deepEqual(entry("Base.Util", "type:Pair").constructors, ["Pair"]);
  assert.deepEqual(entry("Base.Util", "type:Tag").constructors, ["Red", "Blue"]); // Tag(Red, Blue): its own list
  assert.deepEqual(entry("Base.Abstract", "type:Secret").constructors, []); // exported without (..)
  assert.deepEqual(entry("Base.Abstract", "type:Alias").constructors, []);
  assert.deepEqual(entry("Base.Abstract", "type:Via").constructors, ["Via"]); // newtype
  assert.deepEqual(entry("Base.Abstract", "type:Multi").constructors, ["One", "Two", "Three"]); // over lines, with a record
  assert.deepEqual(entry("Base.Abstract", "type:Kinded").constructors, ["Kinded"]); // after a kind signature, as Type.Proxy has
  assert.deepEqual(entry("Base.Via", "type:Box").constructors, ["Box", "Empty"]); // re-exported: read where it is declared
  assert.deepEqual(entry("Base.Util", "value:Box").type, "Box");
  assert.equal(entry("Base.Util", "value:Red").kind, "constructor");
});

test("the name table's rows: a type with all its constructors is data, each constructor a row with its type; none for a partial export", () => {
  const libs = miniLibs();
  const rows = (m) => nameRows(exportsOf(libs, m)).map((r) => r.join(":")).sort();
  assert.deepEqual(rows("Base.Core"), ["<+>:operator", "Alias:type", "Box:constructor:Box", "Box:data", "Empty:constructor:Box", "Show:type", "open:value", "render:value"]);
  assert.deepEqual(rows("Base.Abstract").filter((r) => /^(Secret|Alias|Via|One)/.test(r)), ["Alias:type", "One:constructor:Multi", "Secret:type", "Via:constructor:Via", "Via:data"]);
  // Tag(Red, Blue) lists some constructors, so Tag is a plain type and Red and Blue are not rows (Tag(..) would ask for Green)
  assert.deepEqual(rows("Base.Util").filter((r) => /^(Tag|Red|Blue)/.test(r)), ["Tag:type"]);
});

test("imported constructor sets: T(..) needs constructors, T(A, B) needs each of them, an unknown type or constructor fails", () => {
  const libs = miniLibs();
  assert.deepEqual(names(libs, "import Base.Core (Box(..))"), []);
  assert.deepEqual(names(libs, "import Base.Via (Box(..))"), []);
  assert.deepEqual(names(libs, "import Base.Abstract (Via(..), Multi(..))"), []);
  assert.deepEqual(names(libs, "import Base.Util (Pair(..), Tag(Red, Blue))"), []);
  assert.deepEqual(names(libs, "import Base.Core (Box(Box))"), []);
  assert.deepEqual(names(libs, "import Base.Core (Box(Missing))"), ["line 1: Base.Core does not export a constructor Missing of Box"]);
  assert.deepEqual(names(libs, "import Base.Util (Tag(Green))"), ["line 1: Base.Util does not export a constructor Green of Tag"]); // declared, not exported
  assert.deepEqual(names(libs, "import Base.Abstract (Secret(..))"), ["line 1: Base.Abstract exports Secret without constructors, so Secret(..) is not allowed"]);
  assert.deepEqual(names(libs, "import Base.Abstract (Alias(..))"), ["line 1: Base.Abstract exports Alias without constructors, so Alias(..) is not allowed"]);
  assert.deepEqual(names(libs, "import Base.Core (Nope(..))"), ["line 1: Base.Core does not export Nope"]);
  assert.deepEqual(names(libs, "import Base.Core (Box)"), []); // the bare type is still fine
});

// * The name check, on the real pinned libraries (needs PURS_LIBS)

const haveSources = libsFolder() !== null;
const sourced = (name, fn) => test(name, { skip: !haveSources && "set PURS_LIBS" }, fn);

sourced("a name the module does not export fails when the sources are there", async () => {
  const ps = languageNamed("purescript");
  const lint = (line) => importLint(line, ps).problems;
  assert.deepEqual(lint("import Data.Array (cons, filter, (:), (!!))\nimport Data.Maybe (Maybe(..), fromMaybe)\nimport Prelude (map, (<>), Unit, unit, class Show)"), []);
  assert.deepEqual(lint("import Data.Array (cons, nope)"), ["line 1: Data.Array does not export nope"]);
  assert.deepEqual(lint("import Data.Maybe (Maybe(..), fromJust, mapMaybe)"), ["line 1: Data.Maybe does not export mapMaybe"]);
  const bank = bankWith("", importing("import Data.Array (cons, nope)"));
  const { failures, notes } = await checkBank(bank);
  assert.deepEqual(failures[0].problems, ["line 2: Data.Array does not export nope"]);
  assert.deepEqual(notes, []);
});

sourced("a Reference Solution's import of Type(..) is checked against the real libraries: constructors there pass, a constructor set that does not exist fails", () => {
  const ps = languageNamed("purescript");
  const lint = (line) => importLint(line, ps).problems;
  assert.deepEqual(lint("import Data.Maybe (Maybe(..))\nimport Data.Either (Either(..))\nimport Data.Tuple (Tuple(..), fst)\nimport Data.List (List(..), (:))"), []);
  assert.deepEqual(lint("import Data.Maybe (Maybe(Just, Nothing))"), []);
  assert.deepEqual(lint("import Data.Maybe (Maybe(Just, Missing))"), ["line 1: Data.Maybe does not export a constructor Missing of Maybe"]);
  assert.deepEqual(lint("import Data.Maybe (Nope(..))"), ["line 1: Data.Maybe does not export Nope"]);
  // a type that exists but has no constructors there (a foreign type, a synonym, a class)
  assert.deepEqual(lint("import Data.Void (Void(..))"), ["line 1: Data.Void exports Void without constructors, so Void(..) is not allowed"]);
  assert.deepEqual(lint("import Data.Foldable (Foldable(..))"), ["line 1: Data.Foldable exports Foldable without constructors, so Foldable(..) is not allowed"]);
  assert.deepEqual(lint("import Data.Maybe (Maybe(..)"), ["line 1: only one-line imports are allowed (import M (a, b)): import Data.Maybe (Maybe(..)"]);
});

sourced("the committed module lists match the library sources", () => {
  assert.deepEqual(pinnedDrift(libsFolder(), loadPinned(languageNamed("purescript"))), []);
});

// * The prompt lint

test("a prompt with Language-specific call syntax fails; plain input → output pairs pass", async () => {
  const plain = [
    'For example, "internationalization" → "i18n".',
    "Return the sum of two lists. For example, [1,2,3], [4,5,6] → 32, and the function is applied (once) to each.",
    "Split a list into lists; the (last) one holds what is left.",
    "Return true if every ( in the text is closed by a later ).",
  ];
  for (const p of plain) assert.deepEqual(promptProblems(p, "chunk"), [], p);
  const flagged = {
    "chunk([1,2,3], 2) → [[1,2],[3]]": /a call such as chunk\(…\)/,
    "For example, isBalanced(\"(a)\") → true": /a call such as isBalanced\(…\)/,
    "clamp(15, 0, 10) → 10": /a call such as clamp\(…\)/,
    "Apply it with xs.map(f) to every item": /a method call/,
    "Return n => n * 2 for each": /an arrow/,
    "chunk :: Array Int -> Int": /an arrow, comparison or type signature/,
    "Return \\x -> x + 1": /an arrow/,
    "const total = 0 first": /a variable declaration/,
    "Pass function (x) to it": /a function expression/,
  };
  for (const [p, re] of Object.entries(flagged)) {
    const found = promptProblems(p, p.startsWith("clamp") ? "clamp" : "chunk");
    assert.equal(found.length >= 1, true, p);
    assert.match(found[0], /^prompt has Language-specific call syntax /);
    assert.match(found[0], re, p);
  }
});

test("the bank check fails a Puzzle whose prompt has call syntax, and the real bank has none", async () => {
  const { failures } = await checkBank(join(here, "fixtures", "prompt-call-syntax"));
  assert.equal(failures.length, 1);
  assert.match(failures[0].problems[0], /^prompt has Language-specific call syntax \(a call such as double\(…\)\)/);
  const real = await checkBank(join(here, "..", "..", "..", "puzzles"), { libs: "" });
  assert.deepEqual(real.failures, []);
});
