# RPT-6 · Dashboard drilldowns

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:reporting`, `ui` |
| **Depends on** | RPT-1, RPT-3 |
| **PRD stories** | 74 |
| **ADRs** | 0016, 0017 |
| **Glossary** | Dashboard, Monthly Ledger, Ledger Filter |

## Intent

Charts should lead to the underlying records (PRD 74): clicking a Dashboard element (a month
bar, a category, a Paid By segment) navigates to the **Monthly Ledger** with a **Ledger Filter**
pre-filled to match — turning a summary into a list you can act on. This is a UI-wiring slice;
the data already exists in RPT-1/2/3.

## Implement

- **Web only:**
  - Make Dashboard elements interactive: a month bar (RPT-4) → Ledger for that month; a category
    (RPT-5) → Ledger Filter narrowed to that Category; a Paid By segment → Ledger Filter narrowed
    to that Member; a recent Transaction → its detail (TXN-4).
  - Encode filters in the Transactions route (URL search params) so a drilldown is a navigation
    to a filtered Ledger state, shareable and back-button friendly (ADR 0017 declared routes).
  - Reuse RPT-1's ledger + RPT-2's filter state; don't build a new list.

## Why this way

- **Filters live in the URL** so drilldowns are real navigations (deep-linkable, reactive), not
  ephemeral component state — consistent with the declared-routes model.
- Reuses existing read surfaces; no new backend.

## How to test

- **Navigation:** clicking a month bar lands on the Ledger for that month; a category lands
  filtered to it; a Paid By segment lands filtered; a recent row opens the Transaction.
- **URL state:** the resulting Ledger reads its filter from the URL; reloading preserves it;
  back returns to the Dashboard.
- **E2E:** Dashboard → drilldown → see the matching filtered records.

## Done when

- Dashboard charts, categories, Paid By segments, and recent items drill into the correctly
  pre-filtered Monthly Ledger (filters in the URL); tests green; gates pass.

## Out of scope

The chart math (RPT-3/4/5), Monthly Ledger, and Ledger Filter themselves (RPT-1/2).
</content>
