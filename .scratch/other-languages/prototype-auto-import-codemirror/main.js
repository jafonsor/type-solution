import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { history, historyKeymap, defaultKeymap, indentWithTab } from "@codemirror/commands";
import { autocompletion, acceptCompletion, completionStatus, closeCompletion, startCompletion } from "@codemirror/autocomplete";

const TABLE = { take: "Data.Array", drop: "Data.Array", map: "Prelude", length: "Data.Array", toUpper: "Data.String", trim: "Data.String" };
const PRELUDE = new Set(["map"]);

function importedNames(doc) {
  const s = new Set();
  for (const m of doc.matchAll(/^import\s+[\w.]+\s*\(([^)]*)\)/gm)) m[1].split(",").forEach(n => s.add(n.trim()));
  return s;
}

// returns changes that add `name` from `mod` to the import block
function importChange(state, name, mod) {
  const doc = state.doc;
  let lastImport = null;
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (!/^import\s/.test(l.text)) continue;
    lastImport = l;
    const m = /^(import\s+([\w.]+)\s*\()([^)]*)\)\s*$/.exec(l.text);
    if (m && m[2] === mod) {
      const close = l.from + l.text.lastIndexOf(")");
      return { from: close, insert: ", " + name };
    }
  }
  if (lastImport) return { from: lastImport.to, insert: `\nimport ${mod} (${name})` };
  return { from: 0, insert: `import ${mod} (${name})\n\n` };
}

function source(ctx) {
  const w = ctx.matchBefore(/[A-Za-z_][\w']*/);
  if (!w || w.to - w.from < 2) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  if (/^import\s/.test(line.text)) return null;
  const have = importedNames(ctx.state.doc.toString());
  const options = Object.entries(TABLE)
    .filter(([n, m]) => !PRELUDE.has(n) && m !== "Prelude" && !have.has(n))
    .map(([n, m]) => ({
      label: n, detail: m,
      apply(view, completion, from, to) {
        view.dispatch({
          changes: importChange(view.state, n, m),
          userEvent: "input.complete",
        });
        closeCompletion(view);
      },
    }));
  return { from: w.from, options};
}

window.view = new EditorView({
  parent: document.body,
  state: EditorState.create({
    doc: "",
    extensions: [
      history(),
      autocompletion({ override: [source], defaultKeymap: true, activateOnTyping: true, activateOnTypingDelay: 0, interactionDelay: 0, icons: false }),
      Prec.highest(keymap.of([{ key: "Tab", run: v => acceptCompletion(v) }])),
      keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
    ],
  }),
});
window.acc = acceptCompletion;
window.snap = () => ({ doc: view.state.doc.toString(), head: view.state.selection.main.head, comp: completionStatus(view.state) });
