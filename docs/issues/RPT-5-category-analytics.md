# RPT-5 · Category analytics

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:reporting`, `backend`, `ui` |
| **Depends on** | RPT-3 |
| **PRD stories** | 58, 73 |
| **ADRs** | 0005, 0009, 0015 |
| **Glossary** | Dashboard, Category, Archived Category |

## Intent

Category spend, done honestly. Because a Transaction can carry **multiple Categories**,
category totals are **non-additive** — summing them would exceed the real spend and misrepresent
the data (PRD 73). So this is presented as **ranked tagged spend** (each Category's total = sum
of Transactions tagged with it), explicitly NOT a pie/additive breakdown. **Archived Categories
are included when active Transactions in the period still use them** (PRD 58) — spending must
not vanish because a label was archived.

## Implement

- **Convex** (`dashboard.ts`):
  - `getCategoryAnalytics` query: args `{ circleId, month?, type?, paidByMemberId? }`.
    `resolveCircleAccess` → for active Transactions in the period, walk `transactionCategories`
    → per Category, sum the tagged Transactions' amounts in minor units → return a **ranked**
    list `{ categoryId→ref, name, color, status, taggedTotalMinor, txnCount }[]` sorted desc.
    Include Archived Categories that are attached to in-period active Transactions; mark their
    `status` so the UI can badge them.
- **Web:** a ranked bar/list (Recharts or list) labeled as tagged spend, with a note that totals
  are non-additive; archived categories badged; respects Paid By + month.

## Why this way

- **Non-additive by construction:** compute per-Category tagged totals; never present a
  whole-equals-sum-of-parts chart. A multi-category Transaction contributes its full amount to
  *each* of its Categories — document this in the UI so it isn't read as additive.
- **Archived-but-used included** so historical spend stays visible (PRD 58); purely-archived-
  unused Categories are omitted.

## How to test

- **Non-additive correctness:** a Transaction tagged with Categories A and B contributes its
  full amount to both A and B totals; the sum of category totals can exceed total spend — assert
  this is expected, and that total spend (RPT-3) is unchanged.
- **Ranking:** categories ordered by tagged total desc; ties stable.
- **Archived inclusion:** an Archived Category still attached to in-period active Transactions
  appears (badged); an Archived Category with no in-period active Transactions is excluded.
- **Filters:** type and Paid By and month narrow correctly; archived Transactions excluded from
  the math.
- **Access:** non-member → `null`.

## Done when

- Ranked, non-additive tagged category spend in minor units, including archived-but-used
  categories, filterable by month/type/Paid By, clearly not presented as additive; tests green;
  gates pass.

## Out of scope

Totals/recent (RPT-3); month-over-month (RPT-4); drilldowns (RPT-6).
</content>
