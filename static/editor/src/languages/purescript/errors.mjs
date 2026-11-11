// The compiler's text, as a Checker error: kind, the first error cleaned to one
// line, its line, column and range in the player's text, and every error in
// full for the status line's hover. Pure, so Node tests it with texts the real
// compiler printed (test/purescript-errors.test.mjs).
//
// What the compiler prints (purs 0.15.16, `--json-errors` off):
//   Error found:                      or "Error 1 of 2:", "Warning found:", ...
//   in module Main
//   at /w/src/Main.purs:9:5 - 9:8 (line 9, column 5 - line 9, column 8)
//
//     Could not match type ...
//
//   See https://github.com/purescript/documentation/blob/master/errors/X.md for more information,
//   or to contribute content related to this error.
// Warnings (unused names, redundant imports) come first and are not errors.

export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

const HEADER = /^(Error|Warning)(?: (\d+) of (\d+))?(?: found)?:\s*$/;

// The error and warning blocks of the compiler's output:
// [{level: "Error" | "Warning", file, from: {line, column}, to: {line, column}, lines}]
// where lines is the text after the "at" line up to the "See https://" link,
// trimmed and without blank lines at the ends.
export function blocks(text) {
  const out = [];
  let current = null;
  for (const line of stripAnsi(text).split(/\r?\n/)) {
    const h = HEADER.exec(line);
    if (h) { current = { level: h[1], file: null, from: null, to: null, lines: [], seenAt: false, seenSee: false }; out.push(current); continue; }
    if (/^RESULT:/.test(line)) { current = null; continue; }
    if (!current) continue;
    const at = /^\s*at (\S+?):(\d+):(\d+)(?: - (\d+):(\d+))?/.exec(line);
    if (at && !current.seenAt) {
      current.seenAt = true;
      current.file = at[1];
      current.from = { line: Number(at[2]), column: Number(at[3]) };
      current.to = at[4] ? { line: Number(at[4]), column: Number(at[5]) } : current.from;
      continue;
    }
    if (!current.seenAt) continue; // "in module Main"
    if (/^\s*See https?:/.test(line)) current.seenSee = true;
    // The compiler pads a coloured type with lines of spaces: not text. A truly
    // empty line separates paragraphs and stays.
    if (!current.seenSee && !(line.length > 0 && line.trim() === "")) current.lines.push(line);
  }
  for (const b of out) {
    while (b.lines.length && b.lines[0].trim() === "") b.lines.shift();
    while (b.lines.length && b.lines[b.lines.length - 1].trim() === "") b.lines.pop();
  }
  return out;
}

// The message of a block as one line (what puzzle-check's `firstError` makes
// of the same text): the body joined with single spaces, 300 characters at most.
export function oneLine(block) {
  return block.lines.map((l) => l.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 300) || "compile error";
}

const isSyntax = (block) => /Unable to parse module|Unable to lex/.test(block.lines.join("\n"));

// Offset in `code` of a 1-based line and column, clamped to the line (a
// position the text no longer has is the end of its line).
function offsetOf(lineStarts, code, line, column) {
  const l = Math.min(Math.max(line, 1), lineStarts.length);
  const end = l < lineStarts.length ? lineStarts[l] - 1 : code.length;
  return Math.min(lineStarts[l - 1] + Math.max(column - 1, 0), end);
}

function lineStartsOf(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === "\n") starts.push(i + 1);
  return starts;
}

// {line, column} (1-based) of an offset.
function positionOf(lineStarts, offset) {
  let l = 0;
  while (l + 1 < lineStarts.length && lineStarts[l + 1] <= offset) l++;
  return { line: l + 1, column: offset - lineStarts[l] + 1 };
}

// Where to underline a syntax error. The compiler reports the line after the
// break (the token that could not continue, usually at the start of the next
// line), so the underline goes at the end of the last non-blank line before the
// reported position: the last character before it that is not white space.
// A position in the middle of a line (text before it on its own line) is the
// token itself and stays where it is.
function syntaxRange(code, lineStarts, at, to) {
  const offset = offsetOf(lineStarts, code, at.line, at.column);
  const lineStart = lineStarts[Math.min(at.line, lineStarts.length) - 1];
  if (code.slice(lineStart, offset).trim() !== "") {
    const end = Math.max(offsetOf(lineStarts, code, to.line, to.column), offset + 1);
    return { from: offset, to: Math.min(end, Math.max(code.length, offset)) };
  }
  const end = code.slice(0, offset).trimEnd().length;
  if (end === 0) return { from: 0, to: Math.min(1, code.length) };
  return { from: end - 1, to: end };
}

function typeRange(code, lineStarts, from, to) {
  const a = offsetOf(lineStarts, code, from.line, from.column);
  const b = offsetOf(lineStarts, code, to.line, to.column);
  return { from: a, to: Math.min(Math.max(b, a + 1), Math.max(code.length, a)) };
}

// -> null when the output holds no error, else
//   {harness: true, message}                      an error in the generated Harness module
//   {kind: "syntax" | "type", message, line, column, range, ranges, all}
// `code` is the player's text, `headerLines` how many lines the Checker put in
// front of it (the module header), `hasHarness` whether a Harness was compiled.
export function compileError(text, code, headerLines, hasHarness) {
  const errors = blocks(text).filter((b) => b.level === "Error");
  if (errors.length === 0) {
    const crumbs = stripAnsi(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(" ").slice(0, 300);
    return { kind: "crash", message: crumbs || "compile error", line: 1, column: 1, range: { from: 0, to: Math.min(1, code.length) }, ranges: [], all: stripAnsi(text).trim() };
  }
  if (hasHarness && errors.some((b) => /Harness\.purs$/.test(b.file ?? ""))) {
    const b = errors.find((e) => /Harness\.purs$/.test(e.file ?? ""));
    return { harness: true, message: `${b.from ? `${b.from.line}:${b.from.column} ` : ""}${oneLine(b)}` };
  }
  const starts = lineStartsOf(code);
  const found = errors.map((b) => {
    if (!b.from) return { block: b, line: 1, column: 1, range: { from: 0, to: Math.min(1, code.length) } };
    const from = { line: b.from.line - headerLines, column: b.from.column };
    const to = { line: b.to.line - headerLines, column: b.to.column };
    const range = isSyntax(b) ? syntaxRange(code, starts, from, to) : typeRange(code, starts, from, to);
    const where = positionOf(starts, range.from);
    return { block: b, line: where.line, column: where.column, range };
  });
  const first = found[0];
  const all = found.map((f, i) => {
    const body = f.block.lines.join("\n");
    return `${found.length > 1 ? `${i + 1}. ` : ""}line ${f.line}, column ${f.column}\n${body}`;
  }).join("\n\n");
  return {
    kind: isSyntax(first.block) ? "syntax" : "type",
    message: oneLine(first.block),
    line: first.line,
    column: first.column,
    range: first.range,
    ranges: found.map((f) => f.range),
    all,
  };
}
