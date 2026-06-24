# QA-2 · Archived-category-mid-creation e2e validation

| | |
|---|---|
| **Status** | Done — `e2e/transactions-archived-category.spec.ts` |
| **Depends on** | TXN-1 (create form ✅ shipped), CAT-2 (category archive ✅ shipped — `archiveCategory` + `e2e/categories.spec.ts`) — both merged, so **fully grabbable now** |
| **Unlocks** | — (terminal regression guard; sibling of [QA-1](QA-1-concurrency-validation.md), which shipped as `e2e/transactions-concurrency.spec.ts`) |
| **PRD stories** | 57 |
| **ADRs** | 0015 (server-authoritative guards), 0016 (anti-enumeration), 0019 (E2E against self-hosted Convex) |
| **Glossary** | Category, Transaction, Archive, active, Recorded By |

## Intent

Lock in — as an executable, real-backend regression guard — the exact behavior shipped for the
"archived category mid-creation" edge: when a **Category a user already selected** in an open
Create-Transaction form is **archived by another Member before submit**, the form must

1. keep that Category **visible** (rendered as a chip badged `· archived`, still deselectable) —
   **never silently drop it** from the selection, and
2. **block submit** with a clear, accessible (`role="alert"`) message, because an archived Category
   **cannot be newly added** to a new Transaction (PRD story 57).

This is the asymmetry PRD 57 intends: archived Categories *stay attached to existing Transactions
and may remain through edits, but cannot be newly added*. So "selected-then-archived during
creation" is a **new add** → blocked, whereas "created-then-archived" keeps the Category on the
record (shown archived). This slice is the mirror image of QA-1 Scenario 2's keep/block Paid-By
asymmetry.

It exists as its own slice rather than folding into [QA-1](QA-1-concurrency-validation.md) because
its dependency set differs and is **already satisfied** (`TXN-1` + `CAT-2` are both shipped), so it
is independently grabbable. Both belong to the concurrency/stale-state validation family.

## ⚠️ Verified shipped behavior — assert exactly this (do not guess)

All of the below is the **current** code as of this writing. A cheap agent should treat these as
ground truth and not re-derive them.

### Keep-visible (the chip stays, badged)

- The create form loads categories with **archived included**:
  `useCategories(circle.id, activeType, { includeArchived: true })`
  ([transaction-form.tsx:91](../../apps/web-app/app/components/transaction-form/transaction-form.tsx)).
  This is the **reactive** query whose live flip (active → archived) is the entire point of doing
  this as E2E — a mocked rerender can't prove the query actually re-renders the open form.
- A selected Category that flips to `archived` **stays in `field.state.value`** and renders as a
  chip. The chip shows the text `<name> · archived`, carries amber styling, and keeps its remove
  button with aria-label `Remove <name>`
  ([transaction-form-category-section.tsx:244-265](../../apps/web-app/app/components/transaction-form/transaction-form-category-section.tsx)).
- The dropdown **list** filters out non-active rows (`category?.status !== "active"` → `return null`,
  [transaction-form-category-section.tsx:286-289](../../apps/web-app/app/components/transaction-form/transaction-form-category-section.tsx)),
  so an archived Category can no longer be **newly picked** — but an **already-selected** one is kept
  as a chip. That is the keep-visible contract.

### Block (message + real submit gate)

- When a selected Category is archived **and not already attached**, the section renders a
  `role="alert"` message. **Exact copy** (single archived category):

  > `"<name>" was archived and can't be added to a <expense|income>. Remove it to continue.`

  (multi: `Some selected categories were archived and can't be added. Remove them to continue.`)
  Source: [transaction-form-category-section.tsx:310-316](../../apps/web-app/app/components/transaction-form/transaction-form-category-section.tsx).
  Note `<expense|income>` is the live form type interpolated verbatim, e.g. `…added to a expense.`
- The block is **a real submit gate, not just a message.** `onSubmit` calls the shared domain
  `resolveCategories(value.categoryIds, categoryById, alreadyAttached)`
  ([transaction-form.tsx:160-169](../../apps/web-app/app/components/transaction-form/transaction-form.tsx);
  helper in [packages/domain/src/transaction-category-resolve.ts](../../packages/domain/src/transaction-category-resolve.ts)).
  It returns `{ ok: false, reason: "newly_archived" }` for a newly-added archived Category, and the
  handler `return`s early **before** calling the `createTransaction` mutation. On a **create**,
  `alreadyAttached` is the empty set
  ([transaction-form.tsx:118-119](../../apps/web-app/app/components/transaction-form/transaction-form.tsx)),
  so **any** archived selection blocks.
- **Server backstop** (ADR 0015, the authority): `createTransaction` calls the server
  `resolveCategories(ctx, { …, alreadyAttached: new Set() })`
  ([transactions.ts:579](../../packages/convex/convex/transactions.ts)) which rejects an archived
  Category with `archived categories cannot be added`. Already covered by convex-test units —
  `packages/convex/convex/transactions.test.ts:368` (`"rejects an archived category (cannot be newly
  added)"`). **Reference it; do not re-drive through the UI.**

### Recover

- Removing the archived chip (`Remove <name>`) drops it from the selection; the alert clears.
- **`categoryIds` is required: `min(1, "Pick at least one category")`**
  ([packages/domain/src/validation.ts:139-141](../../packages/domain/src/validation.ts)). So after
  removing the only chip the form can't submit on emptiness alone — to prove the recover→succeed
  path you must seed **a second active Category** and pick it. (This is why the seed below is **two**
  active Categories, not one.)

## Why e2e (not just the component test)

The keep-visible + block + recover contract is **already unit-covered** by component tests in
[transaction-form.test.tsx](../../apps/web-app/app/components/transaction-form/transaction-form.test.tsx)
(not `routes/circle/transactions.test.tsx` — that file covers the ledger, not the form), which flip
a **doubled** `listCategories` row to archived mid-render via `rerenderForm()`:

- `it("keeps a category archived mid-edit visible and blocks submit (PRD 57)")` (line ~264) —
  asserts the `Snacks · archived` chip, the `role="alert"`, `createTransaction` **not** called, and
  removal clears the chip.
- `it("blocks newly adding a category that was archived mid-edit")` (line ~681).
- `it("keeps an already-attached archived category on save without blocking")` (line ~651) — the
  keep-side of the asymmetry.

Only a real-backend e2e (ADR 0019) proves the parts the doubled query can't:

- the **reactive** `listCategories({ includeArchived: true })` actually re-renders the open form
  when **another session** archives the Category (the live flip, not a simulated `rerenderForm()`);
- the **server's own** archived-Category rejection in `createTransaction` is intact as the backstop
  even if the client guard regressed;
- **nothing is silently persisted** — the live ledger never gains the blocked Transaction.

As more surfaces reuse the transaction form (TXN-2 edit, CAT-3 inline Category create, RPT-* filters),
this guard ensures the contract survives their refactors.

## Conventions & helpers to reuse (do not hand-roll)

All E2E lives in [`e2e/`](../../e2e); import `test`/`expect` and helpers from
[`e2e/fixtures.ts`](../../e2e/fixtures.ts) — **never** `@playwright/test` directly (a worker-scoped
fixture signs each worker in as its own User + Personal Circle; a bare import drops to an unsigned
context). Read [`e2e/README.md`](../../e2e/README.md) and run with
`pnpm test:e2e:local e2e/transactions-archived-category.spec.ts` (needs Docker; see root CLAUDE.md
"Cursor Cloud" notes for booting the backend).

**Copy the structure of the shipped sibling
[`e2e/transactions-concurrency.spec.ts`](../../e2e/transactions-concurrency.spec.ts) (QA-1)** — it is
the canonical two-context owner+member interleaving against the real backend. Helpers, all from
`fixtures.ts`:

- `createSecondaryBrowserContext(browser, testInfo)` — second User's context; **inherits the active
  project's device settings** (desktop-chromium vs mobile-chromium viewport/UA). Use this, **not**
  bare `browser.newContext()`, or the mobile project breaks.
- `establishE2ESession(page, { baseURL, email, password, name })` — drive the ADR-0019
  email/password bypass on the secondary context's page (session A).
- `createRegularCircleAndFinishSetup(page, { name })` — the worker's `page` (Owner **B**) creates an
  **isolated** regular Circle (don't use the shared Personal Circle). `page.url()` is the Circle URL
  both sessions navigate to.
- `seedActiveMemberOnCircle(page, email, displayName)` — Owner B adds **A** as an active Member
  without the full invite flow.
- `clickCircleChromeTab(page, tab)` — desktop/mobile-safe Circle nav (never bare `getByRole("link")`).
- `createCategoryViaForm(page, { name, type })` — seed an active Category (default `type:"expense"`).
- `pickFormCategory(page, scope, name)` — select a Category in the form combobox (Base UI portals the
  options to `body`, so the option lookup is page-scoped — the helper handles it).
- `archiveWithDoubleCheck(scope, name)` — TXN-3/CAT-2's two-step arm→confirm archive. For a **Category**
  the button is page-level: pass the **page** and the category name, exactly as
  [`e2e/categories.spec.ts:133`](../../e2e/categories.spec.ts) does (`archiveWithDoubleCheck(page, renamed)`).
- `applyLedgerStatus(page, "active" | "archived")` — Transactions ledger status filter, to assert the
  blocked Transaction never appears.

**Stamp every email/circle/category/title with `testInfo.project.name`** (QA-1 pattern:
`const stamp = ${Date.now()}-${testInfo.project.name}`) so the parallel desktop + mobile projects
can't collide. Keep category names **≤ 40 chars** (`LIMITS.categoryNameMax`).

`canArchive` for a Category = **creator OR Owner** ([categories.ts:83,465](../../packages/convex/convex/categories.ts)),
so Owner B (who also created the Category in the seed) may archive it.

## Implement

`e2e/transactions-archived-category.spec.ts`. **No new app code is expected.** If a step exposes a
gap (the form silently drops the archived chip, or a stale write persists), that is a bug fixed at
its owning slice (TXN-1 / CAT-2) with a regression test — not patched or skipped here.

- **Two browser contexts of the same Circle** model the concurrency cleanly:
  - **B = Owner** = the worker's default `page` (signed in by the fixture). Creates the Circle,
    creates the Categories, archives the selected Category.
  - **A = Recorded By** = a secondary context, seeded as an active Member, filling the create form.
- **Seed:** B creates an isolated regular Circle, then **two active expense Categories** — call them
  **CatPick** (the one A selects then B archives) and **CatSpare** (an active Category A uses to prove
  the recover→submit path; required because `categoryIds` has `min(1)`). B seeds A as an active Member.

### Deterministic interleaving (not a simultaneous race)

1. **A**: `goto(circleUrl)` → Transactions → **Add expense**. Fill Title + Amount, then
   `pickFormCategory(aPage, form, "CatPick")` while it's active. **Do not submit.** Assert the
   `Remove CatPick` chip is visible (no `· archived` suffix yet).
2. **B** (default `page`): Categories tab → `archiveWithDoubleCheck(page, "CatPick")`; **await** the
   archived marker (`row.getByText("Archived")`) so completion is ordered before A asserts.
3. **A's open form** (reactive `listCategories` flip, **no reload**): assert the chip now reads
   `CatPick · archived` **and is still selected** (not dropped), and the `role="alert"` block message
   is shown with the exact copy from §"Block".
4. **A**: press **Add expense** → assert the create is blocked: the message persists, and the live
   ledger never gains the Transaction (next step verifies persistence).
5. **A**: deselect the archived chip (`Remove CatPick`) → assert it's removed and the alert clears.
   Then `pickFormCategory(aPage, form, "CatSpare")` and submit → assert the Transaction is created
   (row visible in the active ledger).

## Why this way

- **Deterministic ordering** (A-selects → B-archives → A-submits) exercises the real hazard without
  the CI flake of a true simultaneous race (same rationale as QA-1).
- Driving the **real reactive query** is the whole point — it proves the `includeArchived` widening +
  status flip actually reach the open form, which the doubled-query component test cannot.
- The **server reject** stays the authority (ADR 0015); the client block is a courtesy on top, proven
  here over the live backend.

## How to test

The spec's assertions:

- **Kept visible** — after B archives, A's form still shows the Category chip, now reading
  `CatPick · archived`; the selection is **not** silently emptied (the `Remove CatPick` chip is still
  present). Assert via `aForm.getByText(/CatPick · archived/)` and the `Remove CatPick` button.
- **Blocked** — pressing Add expense with the archived Category selected creates nothing: assert the
  `role="alert"` persists and that, under `applyLedgerStatus(page, "active")` (B's or A's ledger), no
  row with the Transaction title appears.
- **Explains** — the `role="alert"` message names the archived Category with the exact copy
  `"CatPick" was archived and can't be added to a expense. Remove it to continue.`
- **Recoverable** — removing the archived chip clears the alert; selecting **CatSpare** (active) and
  submitting then creates the Transaction (row visible).
- **Server backstop** — covered by `packages/convex/convex/transactions.test.ts:368`
  (`createTransaction` rejects an archived Category); reference it, no need to re-drive through the UI.

## Done when

`e2e/transactions-archived-category.spec.ts` is green against the self-hosted backend asserting
keep-visible + block + explain + recover for a Category archived mid-creation; lint/typecheck/test
gates pass.

## Out of scope

Changing PRD 57 (archived Categories remain forbidden on create — this slice *guards* that rule).
The create form itself (TXN-1) and Category archive (CAT-2) it builds on. Display of archived
Categories on *existing* Transactions (TXN-4 / RPT-*). The edit-form keep/block asymmetry (already
unit-covered; QA-1 Scenario 2 covers the live Paid-By analogue end to end).
