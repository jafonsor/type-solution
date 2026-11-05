// Runs every Solution in every Puzzle in every Language and prints a
// Puzzle × Language table. `node run-solutions.js [folder] [--lang=<name>] [--puzzle=<identity>]`.
//
// Unlike the bank check (check.js) this does not judge length or symbols; it
// only answers "does each Reference Solution pass its tests?". Exits 1 if any
// Solution fails or if a Puzzle has a Solution in a Language with no runner.
//
// To add a Language: put its Reference Solutions in the Puzzle file (see
// `solutionsOf`) and add a runner to `runners`.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { defaultPuzzlesDir, readPuzzle, testProblems } from "./puzzle-check.js";
import { purescriptProblems } from "./purs-runner.js";

// A runner takes a Puzzle and a Solution's code and resolves to a list of
// problems (empty = pass).
export const runners = {
  // The browser's own test-runner script, as the bank check uses it.
  javascript: (puzzle, code, options) => testProblems({ ...puzzle, reference: code }, options),
  // Compiles with purs-core.wasm in Node (see purs-runner.js; needs PURS_WASM and PURS_LIBS).
  purescript: purescriptProblems,
};

// Every Solution a Puzzle holds: [{language, code}], one per Language table
// (see readPuzzle).
export function solutionsOf(puzzle) {
  return [
    { language: "javascript", code: puzzle.reference },
    { language: "purescript", code: puzzle.purescript.reference },
  ];
}

// Resolves to rows [{identity, language, problems}] (problems empty = pass).
export async function runSolutions(dir = defaultPuzzlesDir, { languages, puzzles, options } = {}) {
  const rows = [];
  const names = readdirSync(dir).filter((n) => extname(n) === ".toml").sort();
  for (const name of names) {
    const identity = name.slice(0, -".toml".length);
    if (puzzles && !puzzles.includes(identity)) continue;
    const { puzzle, problems } = readPuzzle(identity, readFileSync(join(dir, name), "utf8"));
    if (!puzzle) {
      rows.push({ identity, language: "-", problems: ["unreadable Puzzle file", ...problems] });
      continue;
    }
    for (const { language, code } of solutionsOf(puzzle)) {
      if (languages && !languages.includes(language)) continue;
      const runner = runners[language];
      rows.push({
        identity,
        language,
        problems: runner ? await runner(puzzle, code, options) : [`no runner for Language ${language}`],
      });
    }
  }
  return rows;
}

export function formatRows(rows) {
  const lines = rows.map((r) => `${r.problems.length === 0 ? "ok  " : "FAIL"} ${r.identity.padEnd(20)} ${r.language}`);
  for (const r of rows.filter((r) => r.problems.length > 0)) {
    lines.push(`\n${r.identity} (${r.language})`, ...r.problems.map((p) => "  " + p.split("\n").join("\n    ")));
  }
  const failed = rows.filter((r) => r.problems.length > 0).length;
  const byLanguage = [...new Set(rows.map((r) => r.language))]
    .map((l) => `${l}: ${rows.filter((r) => r.language === l && r.problems.length === 0).length}/${rows.filter((r) => r.language === l).length}`)
    .join(", ");
  lines.push(`\n${failed === 0 ? "OK" : "FAILED"}: ${rows.length - failed} of ${rows.length} Solution(s) pass (${byLanguage}).`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.split("=")[1]);
  const dir = args.find((a) => !a.startsWith("--")) ?? defaultPuzzlesDir;
  const rows = await runSolutions(dir, {
    languages: flag("lang").length ? flag("lang") : undefined,
    puzzles: flag("puzzle").length ? flag("puzzle") : undefined,
  });
  console.log(formatRows(rows));
  process.exitCode = rows.length > 0 && rows.every((r) => r.problems.length === 0) ? 0 : 1;
}
