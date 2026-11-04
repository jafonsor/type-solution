Type: grilling
Status: resolved
Blocked by: none

# 16: How are options, Languages and existing saved data laid out in the browser?

## Question

Saved data today has no Language. With per-Language Personal bests, per-Language key-press records, a remembered last Language and the first menu option ("Show error underlines", `type-solution.options`, [ticket 12](12-grilling-check-latency-and-syntax-errors.md)): what is the storage layout and keys, how do today's Personal bests and key-press records carry over as JavaScript, how are drafts kept per Puzzle and Language, and how does the menu lay out and read options?

## Answer

- **Run records.** Stay in the single list `localStorage["type-solution.runs"]`. Each new record gains a `language` field. A record with no `language` reads as JavaScript; old records are never rewritten. The storage-full rule (strip key presses from the oldest records first, never drop summaries) is unchanged and applies to every Language.
- **Derived data.** Personal best, Most missed and Slowest are still worked out from the records each time and never stored, now filtered by the current Language. The "last 20 passed records" window counts only that Language's records.
- **Last Language.** Own key `type-solution.language`, read once on page load. Missing or unknown value falls back to JavaScript.
- **Drafts.** Memory only, per Puzzle Run and Language. A reload starts a fresh Run with empty drafts; nothing is saved.
- **Options.** One key `type-solution.options` holding a JSON object, first field `underlines` (default on). Missing key or field takes the default; unknown fields are preserved when saving.
- **Menu.** The underline toggle is a checkbox in the menu, after the two buttons, reachable by Tab and flipped with Space. The bar under the editor stays Language-only.
