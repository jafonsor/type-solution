// The Puzzle bank check's command: `node check.js [folder]`, the folder being
// the repo's puzzles/ by default. Prints each failing Puzzle file and why,
// then the symbol report (one table per Language in languages/). Exits 1 if any
// Puzzle file fails, else 0. `--languages=<folder>` reads the Languages from
// another folder.
import { checkBank, defaultPuzzlesDir } from "./puzzle-check.js";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) ?? defaultPuzzlesDir;
const languagesDir = args.find((a) => a.startsWith("--languages="))?.slice("--languages=".length);
const { ok, checked, failures, report, notes } = await checkBank(dir, { languagesDir });

for (const { file, identity, problems } of failures) {
  console.error(`FAIL ${file}${identity ? ` (Puzzle ${identity})` : ""}`);
  for (const p of problems) console.error("  " + p.split("\n").join("\n    "));
}
console.log(report);
for (const note of notes) console.log(`\nNote: ${note}`);
console.log(
  ok
    ? `\nOK: all ${checked} Puzzle file(s) pass.`
    : `\nFAILED: ${failures.length} of ${checked} Puzzle file(s) fail.`,
);
process.exitCode = ok ? 0 : 1;
