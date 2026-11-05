Type: task
Status: ready-for-agent
Blocked by: 29

# 32: Editor mode and the import popup

## What to build

Build order step 6. PureScript syntax colouring and indent rules; import popup using the name-to-module table generated from the pinned libraries (prototypes: `prototype-auto-import*`, ticket 17). Test the items the spec marks untested.

## Acceptance

- Typing a known name offers its import; switching Language swaps only the editor extension.
