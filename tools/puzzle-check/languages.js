// Reads the repo's languages/<name>/ folders (language.json in each). The check
// iterates over whatever folders it finds: a new Language is a new folder.
//
// language.json holds: name (the folder's name; also the Puzzle file's table
// name), title, limits {minLines, maxLines, minChars, maxChars}, imports (null,
// or {linePattern} - a regular expression for an import line, which the editor
// inserts: such lines are left out of the limits and the symbol counts),
// symbols (a string of the target symbols), timeouts {compileMs, runMs}.
// A Language may add keys of its own (PureScript names its pinned list there).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const defaultLanguagesDir = resolve(here, "../../languages");

const limitKeys = ["minLines", "maxLines", "minChars", "maxChars"];

// The problems with a parsed language.json, as messages.
function configProblems(config, folder) {
  const problems = [];
  const need = (ok, what) => ok || problems.push(`${what} is missing or wrong`);
  need(config.name === folder, `name (must be "${folder}", the folder's name)`);
  need(typeof config.title === "string" && config.title !== "", "title");
  need(
    config.limits && limitKeys.every((k) => Number.isInteger(config.limits[k]) && config.limits[k] >= 0) &&
      config.limits.minLines <= config.limits.maxLines && config.limits.minChars <= config.limits.maxChars,
    "limits (integers minLines, maxLines, minChars, maxChars, minimum not above maximum)",
  );
  need(config.imports === null || (typeof config.imports === "object" && typeof config.imports.linePattern === "string"), "imports (null, or an object with linePattern)");
  need(typeof config.symbols === "string" && config.symbols.length > 0, "symbols (a string)");
  need(config.timeouts && Number.isInteger(config.timeouts.runMs) && (config.timeouts.compileMs === null || Number.isInteger(config.timeouts.compileMs)), "timeouts (runMs, and compileMs or null)");
  return problems;
}

// Every Language under `dir`, sorted by name: [{name, title, limits,
// importLine (RegExp or null), symbols ([char]), timeouts, dir, config}].
// Throws an Error naming the folder and the problem if a folder is unreadable.
export function loadLanguages(dir = defaultLanguagesDir) {
  const found = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "language.json")))
    .map((e) => e.name)
    .sort();
  if (found.length === 0) throw new Error(`no Language folder (with a language.json) in ${dir}`);
  return found.map((folder) => {
    const where = `${folder}/language.json`;
    let config;
    try {
      config = JSON.parse(readFileSync(join(dir, folder, "language.json"), "utf8"));
    } catch (err) {
      throw new Error(`${where}: ${err.message}`);
    }
    const problems = configProblems(config, folder);
    if (problems.length > 0) throw new Error(`${where}: ${problems.join("; ")}`);
    return {
      name: config.name,
      title: config.title,
      limits: config.limits,
      importLine: config.imports ? new RegExp(config.imports.linePattern) : null,
      symbols: [...config.symbols],
      timeouts: config.timeouts,
      dir: join(dir, folder),
      config,
    };
  });
}

export const defaultLanguages = loadLanguages();
export const languageNamed = (name, languages = defaultLanguages) => {
  const found = languages.find((l) => l.name === name);
  if (!found) throw new Error(`no Language folder named ${name}`);
  return found;
};
