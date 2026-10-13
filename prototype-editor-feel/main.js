// PROTOTYPE, throwaway. Answers "Prototype: editor feel and auto-advance"
// (.scratch/type-solution/issues/04-prototype-editor-feel.md).
// Three variants of suggestion presentation + failing-test feedback, switchable
// via ?variant=A|B|C; pause delay via ?pause=<ms> (slider in the bottom bar).
import { EditorView, keymap, lineNumbers, drawSelection, Decoration, WidgetType, ViewPlugin, showTooltip } from "@codemirror/view";
import { EditorState, StateField, Prec } from "@codemirror/state";
import { indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import * as acorn from "acorn";

// ---------- Puzzles (hardcoded; format is "Grilling: Puzzle file format") ----------
const PUZZLES = [
  { fn: "sum", sig: "sum(xs)", prompt: "Return the sum of an array of numbers.",
    tests: [[[[1, 2, 3]], 6], [[[]], 0], [[[-4, 4, 10]], 10]] },
  { fn: "reverseWords", sig: "reverseWords(s)", prompt: "Reverse the order of the words in a sentence (words are separated by single spaces).",
    tests: [[["hello world"], "world hello"], [["a b c"], "c b a"], [["solo"], "solo"]] },
  { fn: "isPalindrome", sig: "isPalindrome(s)", prompt: "Return true if the string reads the same backwards, ignoring case.",
    tests: [[["Racecar"], true], [["abc"], false], [[""], true], [["Abba"], true]] },
  { fn: "countVowels", sig: "countVowels(s)", prompt: "Count the vowels (a, e, i, o, u, any case) in a string.",
    tests: [[["hello"], 2], [["xyz"], 0], [["AEIOU"], 5]] },
  { fn: "fizzBuzz", sig: "fizzBuzz(n)", prompt: "Return \"Fizz\" for multiples of 3, \"Buzz\" for multiples of 5, \"FizzBuzz\" for both, otherwise the number as a string.",
    tests: [[[3], "Fizz"], [[10], "Buzz"], [[30], "FizzBuzz"], [[7], "7"]] },
  { fn: "maxOf", sig: "maxOf(xs)", prompt: "Return the largest number in a non-empty array.",
    tests: [[[[3, 9, 2]], 9], [[[-5, -2]], -2], [[[1]], 1]] },
];

const BUILTINS = ["return", "function", "const", "length", "map", "filter", "reduce", "forEach", "push", "slice",
  "split", "join", "reverse", "includes", "indexOf", "sort", "toLowerCase", "toUpperCase", "Math", "max", "min",
  "floor", "String", "Number", "Array", "from", "Object", "keys", "values", "entries", "replace", "every", "some"];

// ---------- Params ----------
const params = new URLSearchParams(location.search);
const VARIANTS = { A: "Ghost text + count", B: "Hint list + test panel", C: "Zen: border + first failure" };
const variant = VARIANTS[params.get("variant")] ? params.get("variant") : "A";
let pause = Number(params.get("pause")) || 400;

// ---------- Test runner: fresh module worker per check, one warm spare ----------
const WORKER_SRC = `
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
self.onmessage = (e) => {
  const { code, fn, tests } = e.data;
  let f;
  try { f = new Function('"use strict";\\n' + code + '\\n;return ' + fn + ';')(); }
  catch (err) { postMessage({ kind: "error", message: String(err) }); return; }
  if (typeof f !== "function") { postMessage({ kind: "error", message: fn + " is not a function" }); return; }
  const results = tests.map(([args, expected]) => {
    try { const got = f(...structuredClone(args)); return { pass: eq(got, expected), args, expected, got: got === undefined ? "undefined" : JSON.stringify(got) }; }
    catch (err) { return { pass: false, args, expected, got: String(err) }; }
  });
  postMessage({ kind: "results", results });
};`;
const workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
const spawn = () => new Worker(workerUrl, { type: "module" });
let spare = spawn();
let inflight = null; // { worker, timer }

function runTests(code, puzzle) {
  return new Promise((resolve) => {
    cancelInflight();
    const worker = spare; spare = spawn();
    const t0 = performance.now();
    const timer = setTimeout(() => { worker.terminate(); inflight = null; resolve({ kind: "timeout", ms: 1000 }); }, 1000);
    inflight = { worker, timer, resolve };
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); inflight = null; resolve({ ...e.data, ms: performance.now() - t0 }); };
    worker.postMessage({ code, fn: puzzle.fn, tests: puzzle.tests });
  });
}
function cancelInflight() {
  if (!inflight) return;
  clearTimeout(inflight.timer); inflight.worker.terminate(); inflight.resolve({ kind: "superseded" }); inflight = null;
}

// ---------- Game state ----------
const S = {
  variant, pause, puzzleIdx: Math.floor(Math.random() * PUZZLES.length),
  status: "idle", // idle | typing | checking | syntax | failing | timeout | passed
  startedAt: null, keystrokes: 0, backspaces: 0, checks: 0,
  syntaxError: null, runtimeError: null, results: null, lastCheckMs: null, lastRun: null,
};
const puzzle = () => PUZZLES[S.puzzleIdx];
let pauseTimer = null, seq = 0;

function scheduleCheck(view) {
  clearTimeout(pauseTimer);
  cancelInflight();
  S.status = "typing"; render();
  pauseTimer = setTimeout(() => check(view), S.pause);
}

async function check(view) {
  const code = view.state.doc.toString();
  const my = ++seq;
  S.checks++;
  try { acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" }); S.syntaxError = null; }
  catch (err) { S.syntaxError = err.message; S.status = "syntax"; S.results = null; render(); return; }
  S.status = "checking"; render();
  const r = await runTests(code, puzzle());
  if (my !== seq || r.kind === "superseded") return;
  S.lastCheckMs = r.ms;
  if (r.kind === "timeout") { S.status = "timeout"; S.results = null; S.runtimeError = "Timed out after 1 s (infinite loop?)"; }
  else if (r.kind === "error") { S.status = "failing"; S.results = null; S.runtimeError = r.message; }
  else {
    S.runtimeError = null; S.results = r.results;
    S.status = r.results.every((t) => t.pass) ? "passed" : "failing";
  }
  render();
  if (S.status === "passed") finishRun(view);
}

function finishRun(view) {
  const secs = (performance.now() - S.startedAt) / 1000;
  const len = view.state.doc.toString().replace(/\s+/g, "").length;
  S.lastRun = { fn: puzzle().fn, secs: +secs.toFixed(2), cpmKeys: Math.round(S.keystrokes / (secs / 60)), cpmFinal: Math.round(len / (secs / 60)), backspaces: S.backspaces };
  render();
  setTimeout(() => nextPuzzle(view), 900);
}

function nextPuzzle(view) {
  clearTimeout(pauseTimer); cancelInflight(); seq++;
  let i; do { i = Math.floor(Math.random() * PUZZLES.length); } while (i === S.puzzleIdx);
  Object.assign(S, { puzzleIdx: i, status: "idle", startedAt: null, keystrokes: 0, backspaces: 0, checks: 0, syntaxError: null, runtimeError: null, results: null });
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" }, annotations: [] });
  S.status = "idle"; clearTimeout(pauseTimer);
  render(); view.focus();
}

// ---------- Suggestions (never acceptable: purely decorative) ----------
function suggest(state) {
  const pos = state.selection.main.head, line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from), after = line.text.slice(pos - line.from);
  const m = /[A-Za-z_$][\w$]*$/.exec(before);
  if (!m || m[0].length < 2 || /^[\w$]/.test(after)) return null;
  const prefix = m[0];
  const docWords = [...new Set(state.doc.toString().match(/[A-Za-z_$][\w$]{2,}/g) || [])];
  const pool = [...new Set([puzzle().fn, ...docWords, ...BUILTINS])];
  const list = pool.filter((w) => w !== prefix && w.startsWith(prefix)).slice(0, 5);
  return list.length ? { prefix, list, from: pos - prefix.length, pos } : null;
}

class Ghost extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(o) { return o.text === this.text; }
  toDOM() { const s = document.createElement("span"); s.className = "ghost"; s.textContent = this.text; return s; }
}
const ghostText = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = this.build(v.state); }
  update(u) { if (u.docChanged || u.selectionSet) this.decorations = this.build(u.state); }
  build(state) {
    const s = suggest(state);
    if (!s) return Decoration.none;
    return Decoration.set([Decoration.widget({ widget: new Ghost(s.list[0].slice(s.prefix.length)), side: 1 }).range(s.pos)]);
  }
}, { decorations: (v) => v.decorations });

function hintTooltip(state) {
  const s = suggest(state);
  if (!s) return null;
  return { pos: s.from, above: false, arrow: false, create() {
    const d = document.createElement("div"); d.className = "hints";
    d.innerHTML = s.list.map((w) => `<div><b>${w.slice(0, s.prefix.length)}</b>${w.slice(s.prefix.length)}</div>`).join("");
    return { dom: d };
  } };
}
const hintList = StateField.define({
  create: hintTooltip,
  update: (t, tr) => (tr.docChanged || tr.selection ? hintTooltip(tr.state) : t),
  provide: (f) => showTooltip.from(f),
});

let stripEl = null; // variant C: peripheral names strip
const namesStrip = EditorView.updateListener.of((u) => {
  if (!stripEl || !(u.docChanged || u.selectionSet)) return;
  const s = suggest(u.state);
  stripEl.innerHTML = s ? s.list.map((w) => `<span><b>${w.slice(0, s.prefix.length)}</b>${w.slice(s.prefix.length)}</span>`).join("") : "&nbsp;";
});

// ---------- Layouts ----------
const app = document.getElementById("app");
document.body.className = "v" + variant;
const LAYOUTS = {
  A: `<header><div class="sig" id="sig"></div><div class="prompt" id="prompt"></div></header>
      <div id="editor"></div>
      <div class="statusline"><span id="dot"></span><span id="count"></span><span class="spacer"></span><span id="stats"></span></div>
      <div id="lastrun"></div>`,
  B: `<div class="cols"><div class="main">
        <header><div class="sig" id="sig"></div><div class="prompt" id="prompt"></div></header>
        <div id="editor"></div><div id="stats"></div><div id="lastrun"></div>
      </div><aside><h3>Tests</h3><div id="panel"></div></aside></div>`,
  C: `<div class="timer" id="timer">0.0</div>
      <div class="prompt" id="prompt"></div><div class="sig" id="sig"></div>
      <div id="editor"></div><div class="strip" id="strip">&nbsp;</div>
      <div class="whisper" id="whisper">&nbsp;</div><div id="lastrun"></div>`,
};
app.innerHTML = LAYOUTS[variant];
stripEl = document.getElementById("strip");
const $ = (id) => document.getElementById(id);

const variantExt = { A: [ghostText], B: [hintList], C: [namesStrip] }[variant];

// ---------- Editor ----------
const view = new EditorView({
  parent: $("editor"),
  state: EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(), history(), drawSelection(), indentOnInput(), bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle), javascript(),
      // No closeBrackets(), no autocompletion(): Tab indents, Enter newlines, suggestions can't be taken.
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      variantExt,
      Prec.highest(EditorView.domEventHandlers({
        keydown(e, v) {
          if (e.key === "Escape") { S.lastRun = { gaveUp: puzzle().fn }; nextPuzzle(v); return true; }
          if (S.status === "passed") return true; // freeze during auto-advance
          if (e.key === "Backspace" || e.key === "Delete") S.backspaces++;
          if (e.key.length === 1 || e.key === "Enter" || e.key === "Tab" || e.key === "Backspace" || e.key === "Delete") S.keystrokes++;
          return false;
        },
      })),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged || S.status === "passed") return;
        if (u.state.doc.length === 0 && S.startedAt === null) return; // programmatic clear
        if (S.startedAt === null) S.startedAt = performance.now();
        scheduleCheck(u.view);
      }),
    ],
  }),
});
view.focus();

// ---------- Render ----------
const fmtArgs = (a) => a.map((x) => JSON.stringify(x)).join(", ");
function render() {
  const p = puzzle();
  $("sig").textContent = p.sig;
  $("prompt").textContent = p.prompt;
  const secs = S.startedAt ? (performance.now() - S.startedAt) / 1000 : 0;
  const passing = S.results ? S.results.filter((t) => t.pass).length : 0;

  if (variant === "A") {
    $("dot").className = "dot " + S.status;
    $("count").textContent =
      S.status === "idle" ? "start typing" :
      S.status === "typing" ? "…" :
      S.status === "checking" ? "checking" :
      S.status === "syntax" ? "incomplete" :
      S.status === "timeout" ? "timed out" :
      S.results ? `${passing}/${p.tests.length} tests` : "not runnable yet";
    $("stats").textContent = `${secs.toFixed(1)} s · ⌫ ${S.backspaces}`;
  }

  if (variant === "B") {
    $("stats").textContent = `${secs.toFixed(1)} s · ${S.keystrokes} keys · ⌫ ${S.backspaces} · ${S.status}`;
    let html = "";
    if (S.syntaxError) html += `<div class="err">Syntax: ${S.syntaxError}</div>`;
    if (S.runtimeError) html += `<div class="err">${S.runtimeError}</div>`;
    const rows = S.results || p.tests.map(([args, expected]) => ({ pending: true, args, expected }));
    html += rows.map((t) => `<div class="test ${t.pending ? "pending" : t.pass ? "pass" : "fail"}">
      <span class="mark">${t.pending ? "·" : t.pass ? "✓" : "✗"}</span>
      <code>${p.fn}(${fmtArgs(t.args)})</code> → <code>${JSON.stringify(t.expected)}</code>
      ${!t.pending && !t.pass ? `<div class="got">got <code>${t.got}</code></div>` : ""}</div>`).join("");
    $("panel").innerHTML = html;
  }

  if (variant === "C") {
    $("editor").className = "border-" + S.status;
    $("timer").textContent = secs.toFixed(1);
    // Only whisper the first failure once tests actually ran; never show syntax noise.
    const firstFail = S.results && S.results.find((t) => !t.pass);
    $("whisper").innerHTML =
      S.status === "failing" && firstFail ? `${p.fn}(${fmtArgs(firstFail.args)}) should be <code>${JSON.stringify(firstFail.expected)}</code>, got <code>${firstFail.got}</code>` :
      S.status === "failing" && S.runtimeError ? S.runtimeError :
      S.status === "timeout" ? "timed out" : "&nbsp;";
  }

  const lr = S.lastRun;
  $("lastrun").innerHTML = !lr ? "" : lr.gaveUp ? `gave up on ${lr.fn}` :
    `<b>${lr.fn}</b> passed in <b>${lr.secs}s</b> · ${lr.cpmKeys} keys/min · ${lr.cpmFinal} final-chars/min · ⌫ ${lr.backspaces}`;
  if (S.status === "passed") $("lastrun").classList.add("flash"); else $("lastrun").classList.remove("flash");

  $("state").textContent = JSON.stringify({ ...S, results: S.results && S.results.map((t) => (t.pass ? "✓" : "✗")).join("") }, null, 1);
}
setInterval(() => { if (S.startedAt && S.status !== "passed") render(); }, 100);

// ---------- Prototype switcher bar ----------
const keys = Object.keys(VARIANTS);
function go(v) { const q = new URLSearchParams(location.search); q.set("variant", v); q.set("pause", S.pause); location.search = q.toString(); }
const step = (d) => go(keys[(keys.indexOf(variant) + d + keys.length) % keys.length]);
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("vlabel").textContent = `${variant} (${VARIANTS[variant]})`;
$("pause").value = S.pause; $("pauseVal").textContent = S.pause + " ms";
$("pause").oninput = (e) => {
  S.pause = +e.target.value; $("pauseVal").textContent = S.pause + " ms";
  const q = new URLSearchParams(location.search); q.set("pause", S.pause); history.replaceState(null, "", "?" + q);
  render();
};
$("pause").onchange = () => view.focus();
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, [contenteditable]")) return;
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
render();
