# RPT-6 · Dashboard drilldowns

| | |
|---|---|
| **Status** | Done |
| **Labels** | `area:reporting`, `ui` |
| **Depends on** | RPT-1 (Done), RPT-2 (Done), RPT-3 (Done), RPT-4 (Done · [PR #86](https://github.com/arpitdalal/SpendCircle/pull/86)), RPT-5 (Done · [PR #213](https://github.com/arpitdalal/SpendCircle/pull/213)) — all merged |
| **PRD stories** | 74 |
| **ADRs** | 0005, 0016, 0017 |
| **Glossary** | Dashboard, Monthly Ledger, Ledger Filter, Paid By |

## Intent

Charts should lead to the underlying records (PRD 74): clicking a Dashboard chart navigates to
the **Monthly Ledger** with a **Ledger Filter** pre-filled to match — turning a summary into a
list you can act on. This is a **pure UI-wiring slice**: no new backend, no new query. The data
and both destinations already exist (RPT-1's Ledger, RPT-2's filter codec, RPT-4's month bars,
RPT-5's category rows).

Two drilldown sources exist on the Dashboard today
([`dashboard.tsx`](../../apps/web-app/app/routes/circle/dashboard.tsx)) — wire each to the Ledger:

1. **A month bar** in the month-over-month comparison chart (RPT-4,
   [`dashboard-comparison-chart.tsx`](../../apps/web-app/app/routes/circle/dashboard-comparison-chart.tsx))
   → the **Monthly Ledger for that month**. This is especially valuable because the Dashboard
   hardcodes the current month (`currentMonth(new Date())`, no month picker) — a month bar is the
   only path from the Dashboard to a *past* month's Ledger.
2. **A category row** in the category analytics list (RPT-5,
   [`dashboard-category-analytics.tsx`](../../apps/web-app/app/routes/circle/dashboard-category-analytics.tsx))
   → the **current-month Ledger narrowed to that Category** (and the same Income/Expense `type`
   the analytics list is currently showing).

**The Dashboard's active Paid By selection is carried into every drilldown** so the Ledger opens
describing the same activity the chart did (one Member's spend, if a Member is selected).

### Not in this slice (already shipped or no such element)

- **Recent Transaction → detail is already done.** `RecentRow` in
  [`dashboard.tsx`](../../apps/web-app/app/routes/circle/dashboard.tsx) already links each recent
  row's title to the TXN-4 detail route with a validated `returnTo`. Do **not** rebuild it.
- **There is no "Paid By segment" to click.** Paid By on the Dashboard is a `<select>` filter
  (RPT-3), not a chart/segment/pie. PRD 74 is "*charts* lead to records." Paid By is a *dimension
  carried* into the drilldown (point 3 above), not a click source. Do not build a per-Member chart.

## Implement

**Web only.** No Convex, no `data.ts`, no fixture changes — this slice adds zero queries.

### The drilldown href: translate Dashboard scope → Ledger Filter URL

The two routes use **different URL codecs** — this is the one non-obvious part. Build a *Ledger*
URL, never reuse the Dashboard's params:

- Dashboard codec ([`dashboard-url.ts`](../../apps/web-app/app/lib/dashboard-url.ts)): `paidBy`
  is a **single id string** (`""` = All members), plus `range`, `type` (`expense`/`income`).
- Ledger codec
  ([`transaction-filter-url.ts`](../../apps/web-app/app/lib/transaction-filter-url.ts)): `month`,
  `q`, `type` (`all`/`expense`/`income`), `status` (`active`/`archived`/`all`), and **array**
  params `categories[]`, `recordedBy[]`, `paidBy[]`.

Build the link with the existing helpers (do not hand-roll query strings):

```ts
import { canonicalLedgerParams, defaultLedgerFilters } from "~/lib/transaction-filter-url.js";
import { circlePath } from "~/lib/circle-path.js";
import { withQuery } from "~/lib/ledger-url.js";

function ledgerDrilldownHref(circle, { month, categoryId, type, paidByMemberId }) {
  const filters = defaultLedgerFilters(month);          // month + empty filters
  if (categoryId) filters.categories = [categoryId];    // single id → ledger's array param
  if (type) filters.type = type;                        // "expense" | "income" (else default "all")
  if (paidByMemberId) filters.paidBy = [paidByMemberId];// Dashboard's single Paid By → array
  return withQuery(circlePath(circle.ref, "transactions"), canonicalLedgerParams(filters).toString());
}
```

- A **month-bar** drilldown: `{ month: entry.month, paidByMemberId }` — `type` stays the Ledger
  default (`all`); both Income and Expense for that month are what the user wants to inspect.
- A **category-row** drilldown: `{ month: currentMonth(new Date()), categoryId: row.categoryId,
  type: selection.type, paidByMemberId }` — `selection.type` and `paidByMemberId` come from
  `readDashboardSelection(searchParams)` / the route's already-validated `paidByMemberId` (the same
  value passed to the analytics query, so the Ledger matches exactly what the list showed).
- `defaultLedgerFilters` already leaves `status: "all"`, so archived Transactions appear in the
  drilled-in Ledger marked as archived — same as opening the Ledger directly (CONTEXT: Ledger
  Filter lifecycle defaults to all).

Pass the Member id the route **already validated against the loaded Paid By options**
(`paidByMemberId` in `dashboard.tsx`), not the raw `selection.paidBy` string — a stale/unknown id
is already cleaned to `undefined` there, so the drilldown can't carry a filter the Ledger would
reject.

These are plain in-app navigations (a top-level list route, not an object route), so use a React
Router `<Link>` and **no `returnTo`** — browser Back returns to the Dashboard naturally.
`returnTo` is only for object routes that need an explicit close target (the recent-row → detail
link, already shipped).

### Make each source an accessible affordance (don't bolt onClick onto an aria-hidden SVG)

Both chart surfaces follow the codebase pattern "the Recharts SVG is `aria-hidden`; the accessible
reading is a separate DOM element." A drilldown must be reachable by **keyboard and screen reader**,
not just a mouse click on a decorative SVG (CLAUDE.md / README a11y bar; ADR 0005).

- **Month bars** — the comparison chart renders an `aria-hidden` SVG **and** an `sr-only` `<table>`
  whose body has one row per month (`entry.month`). Make the accessible drilldown live in that
  table: turn each row's month header cell into a real `<Link>` to `ledgerDrilldownHref({ month })`.
  `sr-only` is visually hidden but still focusable, so the link is keyboard/SR reachable. For mouse
  parity, add an `onClick` to the Recharts `<Bar>` (and `cursor-pointer`) that navigates to the same
  href — the SVG stays `aria-hidden` (pointer affordance only), the table link is the a11y path.
  Both must resolve to the **same** href so they can't drift.
- **Category rows** — each row is a `<li>`. Wrap the category **name** in a `<Link>` (mirroring how
  `RecentRow` wraps the Transaction title), with an `aria-label` like `View {name} transactions`.
  The bar stays `aria-hidden`. Native `<a>` = keyboard-operable for free.

Keep money formatting, archived badges, and non-additive copy exactly as RPT-4/RPT-5 left them —
this slice only adds links, it does not restyle the charts.

## Why this way

- **Filters live in the URL** (ADR 0016, ADR 0017), so a drilldown is a real navigation: the
  resulting Ledger reads its filter from the URL, reload preserves it, and Back returns to the
  Dashboard. No ephemeral component state, no new state machine.
- **Reuse the Ledger codec, don't translate by hand.** `defaultLedgerFilters` +
  `canonicalLedgerParams` are the single home for the Ledger param vocabulary; building the href
  through them means a drilldown URL can never diverge from a URL the Ledger itself would produce
  (defaults omitted, ids in the canonical array shape).
- **Carry the *validated* Paid By id**, so the Ledger opens scoped to exactly the activity the chart
  described and never names a filter the Ledger would clean away.
- **Accessible affordance, not an `onClick` on `aria-hidden`.** The chart SVGs are intentionally
  `aria-hidden` with an accessible twin; the drilldown rides the twin so keyboard/SR users get the
  same capability as mouse users.
- **No backend.** The destinations already serve these filters (RPT-1/RPT-2); adding a query would
  duplicate them.

## How to test

Web route/render tests in `apps/web-app/app/routes/circle/*.test.ts(x)`, driving through the shared
[`app/test/convex/dashboard.ts`](../../apps/web-app/app/test/convex/dashboard.ts) double — never
redefine per-file scaffolding (CLAUDE.md). No new Convex tests (no backend change).

- **Month-bar navigation:** the comparison table's month link points at
  `/circles/:ref/transactions?month=<that month>` (assert the `href`); the destination Ledger reads
  that month from the URL. Cover a past month (the Dashboard has no month picker — this is the only
  path to it).
- **Category-row navigation:** the category name link points at the current-month Ledger with
  `categories=<id>` and the current analytics `type` (`expense`/`income`); the destination filters to
  that Category.
- **Paid By carried:** with a Member selected in the Dashboard Paid By filter, both drilldown hrefs
  include `paidBy=<member id>`; with All members selected, neither does. Assert the carried id is the
  *validated* one (a stale `?paidBy=` already cleaned by the route is not carried).
- **URL state round-trips:** the drilled-in Ledger reads its filter from the URL; reloading preserves
  it (true by construction — it's in the URL); Back returns to the Dashboard.
- **Accessibility:** the month link and the category link are keyboard-focusable and have accessible
  names; the chart SVGs remain `aria-hidden` (no interactive element trapped inside an `aria-hidden`
  subtree). A mouse click on a Recharts month bar resolves to the same href as the table link.
- **Empty/loading states unchanged:** with no comparison series / no category rows, there is nothing
  to link and the existing empty/skeleton states still render (no crash building hrefs from an empty
  list).
- **E2E** (extend an existing reporting spec; ADR 0019): Dashboard → click a category drilldown →
  land on the Ledger filtered to that Category and see the matching records.

## Done when

- A month bar drills into the Monthly Ledger for that month, and a category row drills into the
  current-month Ledger filtered to that Category and analytics type; both carry the Dashboard's
  active Paid By scope; filters live in the URL (deep-linkable, reload-safe, Back-friendly); the
  drilldown affordances are keyboard/screen-reader accessible; tests green; gates pass
  (`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`).

## Out of scope

- The chart math and surfaces themselves (RPT-3 totals, RPT-4 comparison, RPT-5 category analytics),
  and the Monthly Ledger + Ledger Filter (RPT-1/RPT-2) — all reused, not rebuilt.
- **Recent Transaction → detail** — already shipped in `RecentRow` (`dashboard.tsx`).
- A **Paid By chart/segment** — no such element exists; Paid By is a filter dimension, not a click
  source (PRD 74 is charts → records).
- Any new backend query, fixture, or `data.ts` hook — this slice wires existing reads.
