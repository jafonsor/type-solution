# The Reference Solution can be shown on hover

The MVP spec (`.scratch/type-solution/spec.md`, I1 and user story 24) said the Reference Solution is never shown to the player, so the player solves rather than copies. The aim of solving it yourself stays; we only relax the "never shown" rule: a hint icon in the bar under the editor shows the Reference Solution, in the Language currently selected, in a tooltip while the mouse is over it. The tests' code stays hidden.

## Why

The game is for practising typing code, and a player who is stuck gets no typing practice. The hint is an opt-in way out for someone who is stuck, most likely in an unfamiliar Language such as PureScript. It is not the intended path: the player is still expected to solve the Puzzle themselves.

## Consequences

- The Reference Solution is player-visible, so the bank check's size rule (4–12 lines, 100–350 characters) also bounds what the tooltip shows, and Reference Solutions must be written to be read.
- Since typing is the point, a Run that used the hint is still a valid Run. It is marked "peeked" (hover open for about a second, in any Language during the Run) and still counts for the Personal best; see the Other Languages map, ticket 15.
