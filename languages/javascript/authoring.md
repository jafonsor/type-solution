# JavaScript: authoring Reference Solutions

Limits and symbols are in `language.json` (the check enforces them): 4 to 12 non-blank lines, 100 to 350 characters, leading whitespace and blank lines not counted.

**No imports.** Pure functions only: arguments in, a value out. No `console.log`, randomness, dates or time, async, or `import`.

**The `Object.keys` key-order trap.** Arguments reach the Solution with their object keys sorted, whatever the file's order, so a result must never depend on an argument's key order (for example returning `Object.keys(obj)` as a list, which comes back sorted, not in the order the test file wrote). Tests compare results as JSON with keys sorted, so `expected` never depends on result key order either. Use integers, or round inside the function, so no result depends on floating-point rounding.

**Style.** Reach the symbol goal by choosing problems whose natural Solution uses the symbols, and by writing references in varied natural styles: template literals, ternaries, arrow functions, single and double quotes, destructuring, spread.

**Peeking.** Write the Reference Solution the way you would want to read it when stuck: plain names, one idea per line, no clever tricks.
