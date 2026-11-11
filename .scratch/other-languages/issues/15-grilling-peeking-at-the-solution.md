Type: grilling
Status: resolved
Blocked by: none

# 15: Does peeking at the Reference Solution cost anything?

## Question

The hover hint shows the Reference Solution in the current Language ([ADR 0001](../../../docs/adr/0001-reference-solution-shown-on-hover.md), [ticket 05](05-prototype-language-dropdown.md)). Does a peek count against the Run or the Personal best (flagged, disqualified, or free)? Is it recorded in the Run? What does it mean for bank authoring (for example, Reference Solutions must be fit to be read, and typing the shown text is a legitimate way to play)?

## Answer

**Plain version: peeking is allowed and free to do, but it is labelled. A peeked Run still counts for the Personal best and still shows "peeked" next to its time.**

- **Effect (marked).** A peeked Run is valid and eligible for a Personal best. It carries a `peeked` flag in the Run record. No second set of bests.
- **What counts.** The hint tooltip open for about 1 second or more during the Run; a brief accidental mouse-over does not count.
- **Across Languages.** Run-wide: a peek at any Language's Reference Solution marks the whole Run, whichever Language passes.
- **Display.** The plain word "peeked" wherever the Run's time is shown: the end-of-Run result, beside the Personal best on the status line, and in lists where a best appears.
- **Replacing a best.** Time only: a faster Run replaces the best, peeked or not, and the mark follows the Run that holds the best. A slower unpeeked Run does not replace a peeked best.
- **Bank authoring.** No new limits beyond ticket 04's size limits, which already bound the tooltip. The `write-puzzle` skill gets one light line: write the Reference Solution the way you would want to read it when stuck. No per-Puzzle switch to hide the hint.
- Written down in `CONTEXT.md` (new term **Peek**, Personal best updated) and [ADR 0001](../../../docs/adr/0001-reference-solution-shown-on-hover.md).
