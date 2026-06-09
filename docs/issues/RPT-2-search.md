# RPT-2 · Search

| | |
|---|---|
| **Status** | Done · [PR #79](https://github.com/arpitdalal/SpendCircle/pull/79) |
| **Labels** | `area:reporting`, `backend`, `ui` |
| **Depends on** | TXN-1, RPT-1 |
| **PRD stories** | 41, 65, 66, 67 |
| **ADRs** | 0009, 0015, 0016, 0021 |
| **Glossary** | Search, Archived Transaction, Archived Category, Removed Member |

## Intent

Search is **integrated with Transactions**, not a separate nav item (glossary). It **defaults to
the selected Monthly Ledger month** (PRD 65) but supports **explicit date ranges and all-time**
(PRD 66). It filters by **Title, Note, Category name, type, Category, Recorded By, Paid By, date
range, and amount range** (PRD 67). Two subtle inclusion rules: normal Search **excludes
archived Transactions** (they're findable only in archived views / archive-only filters — PRD
41), and Search **includes Archived Categories and Removed Members as filter values when
matching historical Transactions exist** (PRD: Search/Removed Member/Archived Category).

## Implement

- **Convex** (`transactions.ts` / `ledger.ts`):
  - `searchTransactions` query: args `{ circleId, query?, type?, categoryIds?, recordedByMemberId?,
    paidByMemberId?, dateFrom?, dateTo?, amountMinFrom?, amountMax?, scope: "month"|"range"|"all",
    includeArchived? }`. `resolveCircleAccess` → `null` if inaccessible → resolve the date window
    from scope (month default from Ledger, explicit range, or all-time) → query Transactions by
    the best index (`by_circle_and_month`/`by_circle_and_date`) then filter in-handler by the
    text/category/member/amount predicates → exclude `archived` unless `includeArchived` (or an
    archive-only filter) → return matched views + totals for the result set.
  - Filter option sources: provide Categories (incl. archived that are used) and Members (incl.
    removed that appear on matching Transactions) for the filter UI — a helper query or extend
    `listCategories`/`listMembers` with the include flags.
- **Web:** Search UI integrated into the Ledger: text box, type toggle, category multi-select,
  Recorded By / Paid By selectors (showing removed members where relevant), date-range / all-time
  controls, amount-range, and an archive-only toggle. Results reuse the ledger row + totals,
  including viewer-locale money display.

## Why this way

- **Default-to-month** keeps the common case fast and bounded; explicit range / all-time widen
  it deliberately (PRD 65, 66).
- **Archived exclusion is the default**, opt-in inclusion only — mirrors TXN-3's contract.
- **Archived Categories / Removed Members appear as filters only when they match real
  Transactions** so the filter list reflects history without offering dead options.
- Text match is substring/case-insensitive over Title/Note/Category name; amounts compared in
  minor units.

## How to test

- **Each filter independently and combined:** title substring, note substring, category-name,
  type, specific Category, Recorded By, Paid By, date range, amount range; AND-combination
  narrows correctly.
- **Scope:** default = selected month; explicit range spanning months; all-time; range
  boundaries inclusive; no-timezone date matching.
- **Archived handling:** archived Transactions excluded by default; archive-only filter shows
  only archived; mixed view when explicitly included.
- **Filter sources:** an Archived Category used by a matching Transaction appears as a filter
  option; a Removed Member who is Paid By / Recorded By on matching Transactions appears as a
  filter option; unused archived categories/removed members do not pollute the list.
- **Amount edges:** min only, max only, min==max, min>max (empty result, no error); minor-unit
  comparison correctness.
- **Access:** non-member → `null`; archived Circle searchable (view-only).

## Done when

- Members can search by all listed fields with month/range/all-time scopes, correct archived
  exclusion + opt-in, and removed-member/archived-category filter inclusion when matching;
  comprehensive tests green; gates pass.

## Out of scope

Dashboard charts/analytics (RPT-3/4/5); export (EXP-1, though it may reuse the filter shape).
</content>
