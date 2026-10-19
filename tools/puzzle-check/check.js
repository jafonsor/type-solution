// The Puzzle bank check's command: `node check.js [folder]`, the folder being
// the repo's puzzles/ by default. Prints each failing Puzzle file and why,
// then the symbol report. Exits 1 if any Puzzle file fails, else 0.
import { checkBank, defaultPuzzlesDir } from "./puzzle-check.js";

const dir = process.argv[2] ?? defaultPuzzlesDir;
const { ok, checked, failures, report } = await checkBank(dir);

for (const { file, identity, problems } of failures) {
  console.error(`FAIL ${file}${identity ? ` (Puzzle ${identity})` : ""}`);
  for (const p of problems) console.error("  " + p.split("\n").join("\n    "));
}
console.log(report);
console.log(
  ok
    ? `\nOK: all ${checked} Puzzle file(s) pass.`
    : `\nFAILED: ${failures.length} of ${checked} Puzzle file(s) fail.`,
);
process.exitCode = ok ? 0 : 1;
