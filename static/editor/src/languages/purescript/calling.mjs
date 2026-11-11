// PureScript's calling convention for the browser Checker: how a test's JSON
// `args` and `expected` become a call. It mirrors, rule for rule,
// tools/puzzle-check/purs-runner.js (the Node twin: `dictionaryKinds`,
// `harnessSource`) and languages/purescript/calling-convention.md; a test
// (tools/puzzle-check/test/browser-twin.test.js) compares the two on every
// Puzzle and on odd inputs, so they cannot drift.
//
// A function with constraints in its type takes one argument per constraint
// before its own, so the Checker reads the constraints off the function's
// signature in the Solution text and decides how to call it:
//   "eq"     the sandbox supplies an Eq dictionary for JSON values;
//   "other"  a row-solved constraint (Union, Nub, ...): the argument is
//            ignored, the sandbox supplies any value;
//   "typed"  anything else (RowToList, Ord, Show, a class the Solution
//            defines): the dictionary's methods depend on the types of the
//            test's values, so the compiler builds it: see harnessSource.

const cheapClasses = { Eq: "eq", Union: "other", Nub: "other", Lacks: "other", Cons: "other", Append: "other" };

// -> one of "eq" | "other" | "typed" per constraint, in order.
export function dictionaryKinds(code, fn) {
  const at = new RegExp(`^${fn}\\s*::((?:.*)(?:\\r?\\n[ \\t]+.*)*)`, "m").exec(code);
  if (!at) return [];
  const type = at[1].replace(/\bforall\b[^.]*\./, "");
  const parts = type.split("=>").slice(0, -1);
  return parts
    .flatMap((part) => {
      const t = part.trim();
      return t.startsWith("(") && t.endsWith(")") ? t.slice(1, -1).split(",") : [t];
    })
    .map((c) => cheapClasses[/^[A-Z]\w*/.exec(c.trim())?.[0]] ?? "typed");
}

// Any one "typed" constraint sends the function down the typed path (and then
// the compiler resolves every constraint, Eq included).
export const needsHarness = (kinds) => kinds.includes("typed");

// The typed path writes a module Harness with one function per test,
// `t0 _ = f <args>`, the arguments being PureScript literals typed from the
// test's JSON:
//   string -> String       integer within 32 bits -> Int     other number -> Number
//   boolean -> Boolean     object -> record, every key a quoted label
//   array -> Array of one element type (every element must give the same type)
// A JSON value with no such type (null, an array of mixed types, an empty array
// whose element type nothing fixes, a string with a character outside printable
// ASCII, a number written with an exponent) throws a message naming the test
// and the value's place.
const int32 = (n) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647;

// -> {code, type}: PureScript source for the value, and a string naming its
// type shape so array elements can be checked against each other.
function literal(value, where) {
  if (typeof value === "string") {
    if (!/^[\x20-\x7e]*$/.test(value)) throw new Error(`${where}: a string with a character outside printable ASCII cannot be written as a literal`);
    return { code: JSON.stringify(value), type: "String" };
  }
  if (typeof value === "boolean") return { code: String(value), type: "Boolean" };
  if (typeof value === "number") {
    const text = String(value);
    if (/e/i.test(text)) throw new Error(`${where}: the number ${text} cannot be written plainly`);
    if (int32(value)) return { code: value < 0 ? `(${text})` : text, type: "Int" };
    const num = Number.isInteger(value) ? `${text}.0` : text;
    return { code: value < 0 ? `(${num})` : num, type: "Number" };
  }
  if (Array.isArray(value)) {
    const items = value.map((v, i) => literal(v, `${where}[${i}]`));
    if (items.length === 0) throw new Error(`${where}: an empty array has no element type to give the compiler`);
    const types = new Set(items.map((i) => i.type));
    if (types.size > 1) throw new Error(`${where}: an array of mixed types (${[...types].join(", ")}) has no PureScript type`);
    return { code: `[${items.map((i) => i.code).join(", ")}]`, type: `Array ${[...types][0]}` };
  }
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(([k, v]) => [k, literal(v, `${where}.${k}`)]);
    return {
      code: `{ ${fields.map(([k, v]) => `${JSON.stringify(k)}: ${v.code}`).join(", ")} }`.replace("{  }", "{}"),
      type: `{${fields.map(([k, v]) => `${k}:${v.type}`).join(",")}}`,
    };
  }
  throw new Error(`${where}: ${value === null ? "null" : typeof value} has no PureScript type`);
}

// `puzzle` is {function, tests: [{args}]}. Throws a readable message when a
// test's values have no PureScript type.
export function harnessSource(puzzle) {
  const lines = puzzle.tests.map((t, i) => {
    const args = t.args.map((a, j) => literal(a, `test ${i + 1} args[${j}]`).code);
    return `t${i} _ = ${puzzle.function} ${args.join(" ")}`;
  });
  return `module Harness where\n\nimport Prelude\nimport Main (${puzzle.function})\n\n${lines.join("\n")}\n`;
}
