# EXP-1 · CSV Export

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:export`, `backend`, `ui` |
| **Depends on** | TXN-1, RPT-2 |
| **PRD stories** | 87, 88 |
| **ADRs** | 0009, 0015, 0016, 0021 |
| **Glossary** | Export |

## Intent

Data portability: any current **Member** can export the current **Transaction Search** result set
as CSV (PRD 87). Export scope follows the Search lifecycle filter — default `status=all` exports
all Transactions (active and archived); `status=active` exports active only; `status=archived`
exports archived only (PRD 88). Only Transactions they
can view (the Circle's), formatted for human reading (amounts with explicit Currency, plain dates,
Member display names, category names) — never raw internal IDs.

## Implement

- **Convex** (`transactions.ts` / new `export.ts`):
  - `exportTransactions` query/action: args mirror **Transaction Search** filters from RPT-2:
    `{ circleId, query?, type, categoryIds?, recordedByMemberIds?, paidByMemberIds?, dateFrom?,
    dateTo?, amountMin?, amountMax?, status }`. `resolveCircleAccess` → `null` if inaccessible →
    gather all matching Transactions, using the same predicate semantics as Transaction Search →
    return rows shaped for CSV: date, type, title, note, amount (positive plain decimal), currency
    (ISO 4217 code), categories (names, joined), Recorded By (display name), Paid By (display
    name), status. No IDs. Cap synchronous export at `EXPORT_LIMIT = 5000`; if the result exceeds
    that cap, return a refusal state instead of partial CSV.
- **Web:** an Export action on the Transaction Search page. It exports the current applied Search
  URL state; default `/search?status=all&type=all` exports all Circle Transactions.
  Build the CSV client-side from the query result (proper escaping of commas/quotes/newlines) and
  trigger a download. No Export button on the Monthly Ledger for v1.

## Why this way

- **Formatted, ID-free rows** so the CSV is meaningful to a human and leaks no internals
  (consistent with the history ID rule).
- **Locale-independent money columns** — export uses a positive plain decimal amount plus
  explicit ISO Currency code, so spreadsheets can calculate without parsing symbols and a
  downloaded file remains unambiguous regardless of the viewer's locale. Expense/Income, not
  amount sign, determines direction.
- **Search-scoped** — export answers "download what I searched for" instead of creating another
  filter surface.
- **Bounded synchronous export** — v1 avoids background jobs; a hard cap prevents a large Circle
  from turning export into an unbounded query/download.
- **Member-scoped, view-only** — Export is a read; no mutation, no history event.

## How to test

- **Scope:** default Search (`status=all`) exports all Transactions and flags status in a column;
  `status=active` exports active only; `status=archived` exports archived only.
- **Filter parity:** title/note query, type, Category, Recorded By, Paid By, date range, amount
  range, and lifecycle status match Transaction Search semantics.
- **Content/format:** positive amount decimals come from minor units; Currency is explicit;
  plain dates are unconverted; Member names are display names (frozen for removed); categories
  joined; **no raw IDs** in any column.
- **Cap:** more than 5,000 matching Transactions refuses export with guidance to narrow Search;
  no partial CSV is downloaded.
- **CSV safety:** titles/notes containing commas, quotes, and newlines are escaped correctly
  (round-trip parse test).
- **Access:** non-member → `null`; archived Circle exportable (view-only).
- **Empty:** a Circle with no Transactions exports headers only.

## Done when

- A Member can export the current Transaction Search result set to correctly-escaped, ID-free CSV
  with explicit Currency and lifecycle status; tests green; gates pass.

## Out of scope

Importing (out of scope for v1); exporting histories (out of scope for v1); exporting from the
Monthly Ledger.
</content>
