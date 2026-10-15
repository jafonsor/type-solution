# Grilling: per-key mistakes and weak-key practice

Type: grilling
Status: resolved

## Question

Does the MVP track mistakes per key (or per pair of keys), given that the real goal is practising a new keyboard layout? If so: what counts as a mistake on a key when the player types a free-form Solution and only Backspace says something went wrong; what a Run records for it (on top of "Grilling: what a Run records and shows"); what the player sees (a heatmap, a weakest-keys list, nothing yet); and whether the next Puzzle leans toward Puzzles that use the player's weak keys.

## Answer

**In the MVP: record per-character data and show the weakest keys.** Leaning the next Puzzle toward weak keys waits until the launch bank's size is known (see "Grilling: Puzzle authoring guide and the launch bank").

**What a passed Run adds:** the raw sequence of key presses, each with its character (what the browser types, not the physical key position) and the time since the previous press. Everything else is derived from it, including pairs if we want them later. When browser storage fills, the oldest Runs lose their key sequence and keep their summary (time, wpm, backspaces, Solution). Esc'd Runs still aren't recorded.

**Two signals, per single character** (`A` and `a` are separate; Shift is part of the layout):

- **Correction**: the first character typed after a run of one or two Backspaces counts as a miss of that character, since it's what the player was aiming for. Three or more Backspaces in a row is a rewrite and counts for nothing.
- **Hesitation**: the time from the previous key press. Gaps over 1.5 s are thinking and are ignored, as is a Run's first key. A character's score is its median delay.

**What the player sees:** two lines below the editor, always visible and refreshed after each passed Run: "Most missed: …" (most Corrections) and "Slowest: …" (highest median Hesitation), five characters each. Both use the last 20 passed Runs, and only characters typed at least 10 times in them. Space, Enter and Tab stay in the stored sequence but never appear in the lists. A list shows nothing until some character reaches the minimum. No keyboard heatmap: we don't know the player's layout.
