Type: prototype
Status: resolved
Blocked by: none

# 05: The Language dropdown and drafts

## Question

How should the Language dropdown look and behave during a Run? Prototype it with the player in the loop: where it sits, what it shows while the Run is paused or finished, what the player sees when switching to a Language they have not typed in yet (an empty editor, the signature pre-filled?), whether the keyboard can switch it without leaving the typing flow, and how a Run's result shows the Language that passed.

## Answer

Variant C, refined: the Language dropdown sits in a thin bar attached directly under the editor, at its right edge, like VS Code's language picker in its status bar (prototype updated to match), with a keyboard shortcut (Alt+L cycles Languages from inside the editor) so switching needs no mouse. Tabs above the editor (B) and a dropdown beside the signature (A) were rejected. Prototype: [prototype-language-dropdown/index.html](../prototype-language-dropdown/index.html). Switching to an untouched Language shows an empty editor (no pre-fill). A small `?` icon in the same bar shows the Reference Solution in a tooltip while the mouse is over it. This reverses the MVP rule that the Reference Solution is never shown; CONTEXT.md is updated and recorded in [ADR 0001](../../../docs/adr/0001-reference-solution-shown-on-hover.md). Whether peeking affects the Run or Personal best is not decided.

## Comments

Prototype built (throwaway, not committed): `.scratch/other-languages/prototype-language-dropdown/index.html`. Open it in a browser; `?variant=A|B|C` or the bottom bar switches. A: dropdown beside the signature. B: tabs above the editor with a dot for Languages holding a draft, Alt+1/Alt+2. C: dropdown in the status line, Alt+L cycles from inside the editor. A checkbox toggles pre-filling the signature in an untouched Language; the result line shows which Language passed. Awaiting the player's verdict before resolving.
