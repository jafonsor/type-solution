Type: task
Status: ready-for-agent
Blocked by: 23

# 35: The PureScript harness calls functions that need a user-written class dictionary (`queryString`)

## What to build

The owner wants `queryString` to keep its advanced type (spec, "Calling convention"; ticket 23 comment): `forall r rl. RowToList r rl => Keys rl => Record r -> String`, with a user-written `Keys` class walked over the row. A JSON-only harness cannot build that dictionary, because it depends on each test's record shape (ticket 23).

Make the harness able to call it. Suggested approach, to be confirmed by measurement: compile, per test whose function has constraints it cannot satisfy by hand, a small generated `Main` wrapper that builds the typed record literal from the test's JSON `args` and calls the Solution at that concrete type, so the compiler resolves the dictionary. Any other approach that keeps tests Language-neutral (L2) is allowed.

## Acceptance

- `queryString` has a `[purescript]` table with the advanced type that passes `npm run solutions -- --lang=purescript --puzzle=queryString` with the tests unchanged; the interim `Object Json` Solution is gone.
- The rule is documented in the spec's "Calling convention" (what the harness builds, what it still cannot: `Ord`, `Show` and so on if still true) and tested in `tools/puzzle-check/test/` (a passing and a failing case).
- The cost per check is measured and recorded; the browser worker (ticket 31) must do the same, noted in 31.
- `npm run check` and `npm test` keep passing.
