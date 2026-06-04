# RPT-3 · Dashboard totals + Paid By filter

| | |
|---|---|
| **Status** | Done · [PR #70](https://github.com/arpitdalal/SpendCircle/pull/70) |
| **Labels** | `area:reporting`, `backend`, `ui` |
| **Depends on** | TXN-1 |
| **Unlocks** | RPT-4, RPT-5, RPT-6 |
| **PRD stories** | 68, 69, 75 |
| **ADRs** | 0009, 0015, 0016 |
| **Glossary** | Dashboard, Paid By |

## Intent

The Dashboard is **per Circle** (PRD 68) — one Circle's finances never mix with another's. V1
shows current-month Income, Expenses, Net, **recent Transactions** (PRD 75), and totals
**filterable by Paid By** (PRD 69) so a Member can inspect one person's activity. Only **active**
Transactions count (archived excluded). This slice is the totals + recent surface; charts
(RPT-4) and category analytics (RPT-5) build on it.

## Implement

- **Convex** new `packages/convex/convex/dashboard.ts`:
  - `getDashboard` query: args `{ circleId, month?, paidByMemberId? }`. `resolveCircleAccess` →
    `null` if inaccessible → default month = current → query active Transactions for the month
    (optionally filtered by `paidByMemberId`) → compute income/expense/net in minor units →
    fetch recent active Transactions (e.g. latest N by createdAt) → return `{ totals, recent,
    currency, month }`.
- **Web:** Dashboard route showing the totals cards, a Paid By filter (current + relevant
  removed Members), and a recent-Transactions list linking to Transaction detail (TXN-4). Derive
  view types; fixtures + `useDashboard`.

## Why this way

- **Per-Circle, active-only, minor-units** — the same money discipline as the Ledger; reuse the
  totals helper if extracted in RPT-1.
- **Paid By filter** narrows the same active set; removed Members remain selectable when they
  appear on matching Transactions (consistent with Search).

## How to test

- **Totals:** income/expense/net correct in minor units for the month; archived excluded; empty
  month → zeros.
- **Paid By filter:** filtering to one Member yields only their Paid-By Transactions' totals;
  filtering to a Removed Member who has matching Transactions works; default = all.
- **Recent:** returns most-recent active Transactions, correct order, excludes archived.
- **Isolation:** a Transaction in another Circle never appears.
- **Access:** non-member → `null`; archived Circle → readable.

## Done when

- Per-Circle current-month Income/Expense/Net with Paid By filtering and a recent-Transactions
  list, active-only and minor-unit accurate; tests green; gates pass.

## Out of scope

Month-over-month charts + comparison ranges (RPT-4); category analytics (RPT-5); drilldowns
(RPT-6).
</content>
