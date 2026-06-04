# EXP-1 · CSV Export

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:export`, `backend`, `ui` |
| **Depends on** | TXN-1 |
| **PRD stories** | 87, 88 |
| **ADRs** | 0009, 0015, 0016, 0021 |
| **Glossary** | Export |

## Intent

Data portability: any current **Member** can export a Circle's Transactions as CSV (PRD 87).
Export includes **active Transactions by default** and **optionally Archived Transactions** (PRD
88) — the Member controls scope. Only Transactions they can view (the Circle's), formatted for
human reading (amounts with explicit Currency, plain dates, Member display names, category
names) — never raw internal IDs.

## Implement

- **Convex** (`transactions.ts` / new `export.ts`):
  - `exportTransactions` query: args `{ circleId, includeArchived? }`. `resolveCircleAccess` →
    `null` if inaccessible → gather Transactions (active, plus archived if requested) → return
    rows shaped for CSV: date, type, title, note, amount (positive plain decimal), currency
    (ISO 4217 code), categories (names, joined), Recorded By (display name), Paid By (display
    name), status. No IDs.
- **Web:** an Export action on the Circle (Ledger/Settings) with an "include archived" toggle;
  build the CSV client-side from the query result (proper escaping of commas/quotes/newlines)
  and trigger a download. Could reuse RPT-2's filter shape later, but v1 scope is whole-Circle.

## Why this way

- **Formatted, ID-free rows** so the CSV is meaningful to a human and leaks no internals
  (consistent with the history ID rule).
- **Locale-independent money columns** — export uses a positive plain decimal amount plus
  explicit ISO Currency code, so spreadsheets can calculate without parsing symbols and a
  downloaded file remains unambiguous regardless of the viewer's locale. Expense/Income, not
  amount sign, determines direction.
- **Member-scoped, view-only** — Export is a read; no mutation, no history event.

## How to test

- **Scope:** default excludes archived; with the toggle, archived included and flagged in a
  status column.
- **Content/format:** positive amount decimals come from minor units; Currency is explicit;
  plain dates are unconverted; Member names are display names (frozen for removed); categories
  joined; **no raw IDs** in any column.
- **CSV safety:** titles/notes containing commas, quotes, and newlines are escaped correctly
  (round-trip parse test).
- **Access:** non-member → `null`; archived Circle exportable (view-only).
- **Empty:** a Circle with no Transactions exports headers only.

## Done when

- A Member can export a Circle's Transactions to correctly-escaped, ID-free CSV with explicit
  Currency and optional archived inclusion; tests green; gates pass.

## Out of scope

Importing (out of scope for v1); exporting histories (out of scope for v1); filtered export.
</content>
