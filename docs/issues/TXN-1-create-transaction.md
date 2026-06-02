# TXN-1 · Create Transaction

| | |
|---|---|
| **Status** | Done · [PR #63](https://github.com/arpitdalal/SpendCircle/pull/63) |
| **Labels** | `area:transactions`, `backend`, `ui` |
| **Depends on** | CAT-1 |
| **Unlocks** | TXN-2, TXN-3, TXN-4, CS-3, MEM-9, RPT-1, RPT-2, RPT-3, EXP-1 |
| **PRD stories** | 27, 28, 31, 32, 33, 34, 35, 36, 37, 45, 50, 51, 52 |
| **ADRs** | 0009, 0010, 0015, 0016, 0018 |
| **Glossary** | Transaction, Expense, Income, Amount, Title, Note, Transaction Date, Recorded By, Paid By, Category, Refund |

## Intent

The core write of the product. A Transaction is a dated money movement in exactly one Circle,
either **Expense or Income**, with an Amount, Transaction Date, Title, optional Note, and
**at least one Category, no duplicates** (PRD 52, 51, 50). Entry is fast and direct: dedicated
**Add Expense / Add Income** CTAs, not a type dropdown (PRD 27, 28).

Two identity fields, deliberately distinct: **Recorded By** is the Member who created it (and
the only one who can later edit its fields), **Paid By** is whose money moved — it defaults to
Recorded By but can be set to any *current* Member (PRD 35, 36, 37). Both can be set for
Expense and Income (PRD 37) so reports filter by whose activity it was. A Refund is just
Income (PRD 45) — no special linkage.

Money correctness is load-bearing: store **positive integer minor units** (ADR 0009), reject
zero/negative/over-precision/absurd values (PRD 31). Dates are **plain `YYYY-MM-DD` strings,
no timezone** (PRD 33); also persist the `YYYY-MM` `month` bucket for the Ledger/Dashboard.

## Implement

- **Domain** (`packages/domain`): `transactionInputSchema` exists — confirm it enforces
  title required/trimmed/max, note optional/max, `type` ∈ types, ≥1 category id, no duplicate
  category ids. Amount parsing uses `parseAmountToMinorUnits` (already handles zero/negative/
  3-decimal/over-max → typed errors) and `isValidMinorUnits`. Date via `isValidPlainDate` +
  `monthOf`. Add domain tests for any uncovered branch.
- **Convex** new `packages/convex/convex/transactions.ts`:
  - `createTransaction` mutation: args `{ circleId, type, title, note?, amountMinorUnits,
    date, categoryIds[], paidByMemberId? }`. Flow:
    `requireCircleAccess` → `assertWritable()` → validate input (Zod) + `isValidMinorUnits` +
    `isValidPlainDate` → resolve `recordedByMemberId = access.membership._id` →
    `paidByMemberId` defaults to recorded-by; if provided, assert it's a **current active
    Member of this Circle** → validate categories: each belongs to this Circle, matches
    `type`, is **active** (archived can't be newly added — PRD 57), ≥1, no dup → insert
    transaction (`month: monthOf(date)`, `status:"active"`, `createdAt/updatedAt: now`) →
    insert `transactionCategories` rows → `recordEvent(transactionEntity(id), actor:
    access.membership, action:"created", changes:[…formatted amount via Circle Currency,
    date, title, type, paidBy display name, category names])`.
  - After first Transaction exists in a Circle, set `circle.currencyLocked = true` if not
    already (the lock itself is CS-3, but creating a Transaction is the trigger — coordinate;
    minimally flip the flag here and let CS-3 own the enforcement + UI).
- **Web:** Add Expense / Add Income CTAs on the Circle dashboard/ledger. Transaction form:
  amount input (formats to 2dp, parses to minor units), date picker (plain date), title,
  note, Category multi-select (active categories of the form's type), Paid By selector
  (current Members, default self). Derive a `Transaction` view type via `FunctionReturnType`;
  add fixtures + `useTransactions`-style hooks as later read slices need them (TXN-1 only
  needs create + enough read to confirm).

## Why this way

- **Amount stored as minor units** so Dashboard sums are exact (PRD 32) — never store floats.
  Parse at the boundary with the domain helper; the handler receives `amountMinorUnits`.
- **Paid By must be a current Member at creation** (PRD: "can be set to another current
  Member"); historical preservation of a later-removed Paid By is handled by materialized
  member identity (already in schema) — you store the `members._id`, and the Member row keeps
  the frozen display name when removed.
- **Categories validated for type + active + membership-in-circle** to prevent cross-Circle
  or wrong-type or archived attachment. This is server-side; the form filtering is courtesy.
- **`month` is denormalized** from `date` so the Ledger/Dashboard query by an index, not by
  scanning + parsing dates.

## How to test

- **Happy:** create Expense and Income with 1 and multiple categories; persists minor units,
  plain date, correct month bucket, recordedBy = creator, paidBy defaults to creator; create
  event recorded with formatted money/date/categories, no raw IDs.
- **Amount edges:** `0` ✗, negative ✗, `999999999.99` ✓ (max), one minor unit over max ✗,
  3-decimal input ✗, non-numeric ✗, empty ✗. (Mostly domain tests; assert the mutation
  rejects too.)
- **Date edges:** invalid format ✗; valid date → correct `month`; ensure no timezone shift
  (a date near month boundary keeps its entered month).
- **Category rules:** zero categories ✗; duplicate category ids ✗; a category from another
  Circle ✗; a category of the wrong type ✗; an **archived** category ✗; ≥1 active correct-type ✓.
- **Paid By:** default = self ✓; set to another current Member ✓; set to a Removed Member ✗;
  set to a Member of a different Circle ✗; Paid By works for Income too.
- **Title/Note:** empty title ✗; whitespace title ✗; over-max title/note ✗; note omitted ✓.
- **Permissions:** Owner ✓, Member ✓, Removed Member ✗, non-member ✗, unauthenticated ✗;
  archived Circle ✗ (`assertWritable`); Personal Circle owner ✓.
- **Currency lock side effect:** first Transaction flips `currencyLocked` true.
- **Live:** creating a Transaction makes it appear in a re-query (basis for RPT live tests).

## Done when

- A Member can record valid Expense/Income with ≥1 active Category and a Paid By; all money/
  date/category/identity invariants enforced server-side; create event recorded; first
  Transaction locks Currency; comprehensive tests green; gates pass.

## Out of scope

Editing/type-change (TXN-2), archive/restore (TXN-3), detail/history view (TXN-4), Ledger/
Dashboard surfaces (RPT-*). CS-3 owns the lock *enforcement* and UI.
</content>
