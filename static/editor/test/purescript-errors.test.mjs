// PureScript's compile errors as Checker errors, from texts the real compiler
// printed (purs 0.15.16 through purs-core.wasm, captured with colours as it
// writes them). Run with `npm test --prefix static/editor`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileError, blocks, stripAnsi } from "../src/languages/purescript/errors.mjs";

const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const SEE = (name, what = "error") => `See https://github.com/purescript/documentation/blob/master/errors/${name}.md for more information,\nor to contribute content related to this ${what}.\n`;

// What the compiler says for `g = "s"` where `g :: Int`, in a module whose
// header (1 line) the Checker added.
const typeError = `Error found:
in module ${Y("Main")}
at /w/src/Main.purs:9:5 - 9:8 (line 9, column 5 - line 9, column 8)

  Could not match type
  ${Y("        ")}
  ${Y("  String")}
  ${Y("        ")}
  with type
  ${Y("     ")}
  ${Y("  Int")}
  ${Y("     ")}

while checking that type ${Y("String")}
  is at least as general as type ${Y("Int")}
while checking that expression ${Y('"s"')}
  has type ${Y("Int")}
in value declaration ${Y("g")}

${SEE("TypesDoNotUnify")}

RESULT: errors
elapsed: 0.5s
`;

const syntaxError = (line, column, what) => `Error found:
at /w/src/Main.purs:${line}:${column} - ${line}:${column + 1} (line ${line}, column ${column} - line ${line}, column ${column + 1})

  Unable to parse module:
  ${what}


${SEE("ErrorParsingModule")}

RESULT: errors
`;

// The player's text for the type error: 9 lines; the Checker put "module Main
// where" before them, so the compiler's line 9 is line 8 here.
const typed = "import Prelude\n\nf :: Int -> Int\nf x = x\n\ng :: Int\n\ng = \"s\"\n\n";

test("a type error: kind, one cleaned line, line and column of the player's text, range of the reported span", () => {
  const e = compileError(typeError, typed, 1, false);
  assert.equal(e.kind, "type");
  assert.equal(e.message, 'Could not match type String with type Int while checking that type String is at least as general as type Int while checking that expression "s" has type Int in value declaration g');
  assert.equal(e.line, 8);
  assert.equal(e.column, 5);
  assert.equal(typed.slice(e.range.from, e.range.to), '"s"');
  assert.deepEqual(e.ranges, [e.range]);
});

test("the full text keeps every line of the message, without the colour padding, the link or the file path", () => {
  const e = compileError(typeError, typed, 1, false);
  assert.equal(e.all, [
    "line 8, column 5",
    "  Could not match type",
    "    String",
    "  with type",
    "    Int",
    "",
    "while checking that type String",
    "  is at least as general as type Int",
    'while checking that expression "s"',
    "  has type Int",
    "in value declaration g",
  ].join("\n"));
  assert.ok(!/ANSI|\x1b|See https|\/w\/src/.test(e.all));
});

test("a module header the player wrote shifts nothing", () => {
  const code = "module Main where\n\nf :: Int\nf = \"s\"\n";
  const text = typeError.replace("9:5 - 9:8 (line 9, column 5 - line 9, column 8)", "4:5 - 4:8 (line 4, column 5 - line 4, column 8)");
  const e = compileError(text, code, 0, false);
  assert.equal(e.line, 4);
  assert.equal(code.slice(e.range.from, e.range.to), '"s"');
});

test("warnings come first and are not errors: the first error is the first Error block", () => {
  const warning = `Warning found:
in module ${Y("Main")}
at /w/src/Main.purs:4:3 - 4:4 (line 4, column 3 - line 4, column 4)

  Name ${Y("x")} was introduced but not used.

in value declaration ${Y("f")}

${SEE("UnusedName", "warning")}

`;
  const error = `Error found:
in module ${Y("Main")}
at /w/src/Main.purs:4:7 - 4:8 (line 4, column 7 - line 4, column 8)

  Unknown value ${Y("y")}


${SEE("UnknownName")}

RESULT: errors
`;
  const code = "f :: Int -> Int\n\nf x = y\n";
  const e = compileError(warning + error, code, 1, false);
  assert.equal(e.kind, "type");
  assert.equal(e.message, "Unknown value y");
  assert.equal(e.line, 3);
  assert.equal(e.column, 7);
  assert.equal(e.ranges.length, 1);
  assert.deepEqual(blocks(warning + error).map((b) => b.level), ["Warning", "Error"]);
});

test("several errors: the first is the status line's, every range is underlined, the hover lists all", () => {
  const text = `Error 1 of 2:
at /w/src/Main.purs:3:1 - 3:2 (line 3, column 1 - line 3, column 2)

  Unknown value ${Y("a")}

${SEE("UnknownName")}

Error 2 of 2:
at /w/src/Main.purs:5:1 - 5:2 (line 5, column 1 - line 5, column 2)

  Unknown value ${Y("b")}

${SEE("UnknownName")}
`;
  const code = "a\n\nb\n";
  const e = compileError(text, "x\n" + code, 1, false);
  assert.equal(e.message, "Unknown value a");
  assert.equal(e.ranges.length, 2);
  assert.deepEqual(e.ranges.map((r) => [r.from, r.to]), [[2, 3], [5, 6]]);
  assert.equal(e.all, "1. line 2, column 1\n  Unknown value a\n\n2. line 4, column 1\n  Unknown value b");
});

test("syntax error: the compiler reports the line after the break; the underline is at the end of the last non-blank line before the position", () => {
  // The player typed (header added, so the compiler's lines are one more):
  //   f x = x +          <- the break, line 1 of the player's text
  //   (blank)
  //   (end)              <- reported: line 3, column 1 -> compiler line 4
  const code = "f x = x +\n\n";
  const e = compileError(syntaxError(4, 1, "Unexpected or mismatched indentation"), code, 1, false);
  assert.equal(e.kind, "syntax");
  assert.equal(e.message, "Unable to parse module: Unexpected or mismatched indentation");
  assert.deepEqual(e.range, { from: 8, to: 9 }, "the last character of line 1, the `+`");
  assert.equal(code.slice(e.range.from, e.range.to), "+");
  assert.equal(e.line, 1);
  assert.equal(e.column, 9);
});

test("syntax error: trailing blanks and indentation before the position do not count as the line", () => {
  const code = "f :: Int\nf x = (x +   \n\n   \n  ";
  // reported at the start of the indentation on the last line (player's line 5, column 3)
  const e = compileError(syntaxError(6, 3, "Unexpected token"), code, 1, false);
  assert.equal(code.slice(e.range.from, e.range.to), "+");
  assert.equal(e.line, 2);
});

test("syntax error: a position in the middle of a line is the token itself, not the line before", () => {
  const code = "f :: Int\nf x = (x +\n\ng :: Int\ng = 1\n";
  const e = compileError(syntaxError(6, 3, "Unexpected token '='"), code, 1, false);
  assert.equal(code.slice(e.range.from, e.range.to), "=");
  assert.equal(e.line, 5);
  assert.equal(e.column, 3);
});

test("syntax error at the very start of the text underlines its first character", () => {
  const code = "  \n";
  const e = compileError(syntaxError(2, 1, "x"), code, 1, false);
  assert.deepEqual(e.range, { from: 0, to: 1 });
});

test("an error in the generated test module is reported as such, with its own position", () => {
  const text = `Error found:
in module ${Y("Harness")}
at /w/src/Harness.purs:6:6 - 6:60 (line 6, column 6 - line 6, column 60)

  No type class instance was found for
  ${Y("  Field Boolean")}

${SEE("NoInstanceFound")}
`;
  const e = compileError(text, "f = 1\n", 1, true);
  assert.equal(e.harness, true);
  assert.equal(e.message, "6:6 No type class instance was found for Field Boolean");
  // not the player's: without a Harness the same file name is not special
  assert.equal(compileError(text, "f = 1\n", 1, false).harness, undefined);
});

test("output with no Error block still gives a message, not a crash of the Checker", () => {
  const e = compileError("something odd\nhappened", "f = 1\n", 1, false);
  assert.equal(e.kind, "crash");
  assert.equal(e.message, "something odd happened");
  assert.equal(stripAnsi("\x1b[33mx\x1b[0m"), "x");
});

test("the message is cut at 300 characters, like puzzle-check's firstError", () => {
  const long = `Error found:\nat /w/src/Main.purs:3:1 - 3:2 (line 3, column 1 - line 3, column 2)\n\n  ${"word ".repeat(100)}\n`;
  assert.equal(compileError(long, "x\n\n\n", 1, false).message.length, 300);
});
