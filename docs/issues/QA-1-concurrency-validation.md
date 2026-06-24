# QA-1 · Concurrent-modification e2e validation

| | |
|---|---|
| **Status** | Done — `e2e/transactions-concurrency.spec.ts` |
| **Depends on** | TXN-2 (#57 ✅), TXN-3 (#58 ✅), MEM-1 (#36 ✅), MEM-5 (#40 ✅) — all merged |
| **Unlocks** | — (terminal; the home for future concurrency/stale-write e2e scenarios) |
| **PRD stories** | Live read-only / revocation promise (same basis as the §5.7 live-update bar) |
| **ADRs** | 0015 (server-authoritative access guards), 0016 (anti-enumeration), 0018 (reactive history/live updates), 0019 (E2E against self-hosted Convex) |
| **Glossary** | Transaction, Recorded By, Paid By, Archive, Owner, Member, Removed Member |

## Intent

Real test users edit the same Circle at the same time, so v1 must degrade **gracefully** under
concurrent modification — never corrupt a row, never silently drop a write, never leave a stale
form that "succeeds" against deleted/archived state. The per-slice tests already assert
invariants for a *single* actor (§5.5); this slice proves the contract holds when **two real
sessions interleave on the same Transaction**, using the real self-hosted backend that ADR 0019
makes the E2E surface (mock-mode could never race two sessions over one row).

It is deliberately the **last** validation slice, like NTF-2 — and it is the standing home for
concurrency/stale-write scenarios. Ship it seeded with the two canonical cases below (archive-vs-edit,
Paid-By-target-removed-mid-edit); future races (two Members editing distinct fields, Currency-lock
race, Category archive vs. attach) are appended here as their features land.

## ⚠️ Read this first — the shipped behavior differs from the original spec

The originally-drafted scenario assumed A would **submit a stale edit** and the **server** would
reject it (`assertWritable` + archived guard), with A then seeing a `role="alert"` message. That is
**not** what ships today. The edit route resolves its target through a **reactive** query, so:

- **A is auto-ejected before it can submit.** The edit form gets its target from
  `useResolvedTransaction` → `useQuery(api.transactions.getEditableTransaction, …)`
  ([use-resolved-transaction.ts](../../apps/web-app/app/lib/use-resolved-transaction.ts)).
  `getEditableTransaction` collapses missing / wrong-Circle / **archived** / not-recorded-by-caller
  all to `null` ([transactions.ts:314](../../packages/convex/convex/transactions.ts)). The instant B
  archives, A's live query flips to `null`, the shared resolver
  ([use-resolved-ref.ts](../../apps/web-app/app/lib/use-resolved-ref.ts)) fires the
  unavailable-link snackbar and **navigates A to the fallback** (the `returnTo` origin, else the
  ledger). The form unmounts — A never reaches the submit button.
- **The user-facing message is an `aria-live="polite"` snackbar, NOT `role="alert"`.**
  Exact copy: **`That link isn't available.`** (the `link` token in
  `UNAVAILABLE_MESSAGES`, [snackbar.tsx](../../apps/web-app/app/lib/snackbar.tsx)). It renders as a
  fixed `aria-live="polite"` `<div>` — assert it with `page.getByText("That link isn't available.")`,
  **not** `getByRole("alert")` and **not** `getByRole("status")` (the comment in snackbar.tsx
  explains it deliberately avoids the status landmark). It auto-hides after ~4s.
- **The server guard is the backstop, not the observed path.** `updateTransaction`
  ([transactions.ts:683](../../packages/convex/convex/transactions.ts)) still runs
  `assertWritable()` then rejects an archived Transaction (`"Archived transactions can't be edited"`),
  but in the deterministic interleaving below A is ejected by the reactive flip first, so the spec
  asserts the **eject**, not a thrown mutation. (The server rejection is already covered by
  convex-test unit tests on `updateTransaction`.)

So this slice's canonical assertion is **live revocation of the open edit form** (snackbar +
navigation), plus **no corruption** (the persisted row equals B's archive exactly).

## Conventions & helpers to reuse (do not hand-roll)

All E2E lives in [`e2e/`](../../e2e); import `test`/`expect` and helpers from
[`e2e/fixtures.ts`](../../e2e/fixtures.ts) — **never** `@playwright/test` directly (a worker-scoped
fixture signs each worker in as its own User; a bare import drops to an unsigned context). Read
[`e2e/README.md`](../../e2e/README.md) and run with `pnpm test:e2e:local e2e/transactions-concurrency.spec.ts`
(needs Docker; see root CLAUDE.md "Cursor Cloud" notes for booting the backend).

The **two-context owner+member** pattern is already established in
[`e2e/members.spec.ts`](../../e2e/members.spec.ts) ("an owner removes a member…", "a removed
member's transactions still show their frozen display name") — copy it. Helpers you need, all from
`fixtures.ts`:

- `establishE2ESession(page, { baseURL, email, password, name })` — drive the ADR-0019
  email/password bypass on a fresh `browser.newContext()` page (session A).
- `createRegularCircleAndFinishSetup(page, { name })` — session B (Owner) creates an isolated
  regular Circle (do **not** use the shared Personal Circle — two sessions need a shared Circle B
  controls). After this, `page.url()` is the Circle URL both sessions navigate to.
- `seedActiveMemberOnCircle(page, email, displayName)` — Owner adds an active Member without the
  full invite flow (returns `{ memberId }`). Use it to add **A** as a Member of B's Circle, and (for
  the Paid-By scenario) to add a throwaway third Member **M** who is never logged in — just a Paid By
  target.
- `clickCircleChromeTab(page, tab)` — desktop/mobile-safe Circle nav (never bare `getByRole("link")`).
- `createCategoryViaForm(page, { name, type })` — A seeds a Category before recording (≥1 active
  Category of the matching type is required).
- `pickFormCategory(page, scope, name)` — pick a Category in a form combobox (options portal to
  `body`).
- `archiveWithDoubleCheck(scope, itemName)` — TXN-3's two-step arm→confirm archive on a row locator
  (`scope` = the ledger `<li>` for the Transaction). Owner B archives A's Transaction this way.
- Edit-form locators (from [transactions.spec.ts](../../e2e/transactions.spec.ts)): open via the
  row's `Edit <title>` link; the form is `getByRole("form", { name: /edit transaction/i })`; the
  ledger Edit link carries `?returnTo=` so the eject lands back on the ledger.

`canArchive` = Recorded By **OR** Owner ([guard.ts](../../packages/convex/convex/guard.ts)), so
Owner B may archive A's Transaction. `listTransactions` shows every Member's rows, so B sees A's row
to archive.

## Implement

`e2e/transactions-concurrency.spec.ts`. **No new app code is expected.** If a step exposes a gap
(the edit form swallows the eject, or a stale write applies), that is a bug fixed at its owning slice
(TXN-2 / TXN-3) with a regression test — not patched or skipped here.

### Scenario 1 — Owner archives a Transaction while its Recorder is mid-edit (canonical)

Setup:
1. Session **B = Owner**: `establishE2ESession` is implicit via the worker fixture for `page`; use
   the default `page` as B. Create the Circle: `createRegularCircleAndFinishSetup(page, { name })`.
   Capture `const circleUrl = page.url()`.
2. Add **A** as an active Member: `await seedActiveMemberOnCircle(page, aEmail, "Member A")`.
3. Session **A = Recorded By Member**: new `browser.newContext()` → `establishE2ESession(aPage, …)`
   → `aPage.goto(circleUrl)`. A creates a Category (`createCategoryViaForm`) and records one active
   expense Transaction through the UI (so A is the Recorded By).

Interleaving (deterministic — **not** `Promise.all`):
1. **A** opens that Transaction's `Edit <title>` link and changes a field (e.g. Title) — **do not
   submit.** Assert the edit form is visible.
2. **B** (back on `page`, on the ledger) archives the Transaction: `archiveWithDoubleCheck(row,
   title)`; **await** the archived marker so completion is ordered.
3. **Assert A's live revocation** (the core proof): without any reload, A's edit form ejects —
   `await expect(aPage.getByText("That link isn't available.")).toBeVisible()` **and** A is
   navigated off the edit URL back to the ledger (`await expect(aPage).toHaveURL(/\/transactions(?:\?|$)/)`
   and the edit form is gone: `toHaveCount(0)` on the edit-form role).
4. **Assert no corruption**: the Transaction's persisted state is exactly B's archive — A's edited
   field did **not** apply. Verify via A's (or B's) view: in the **Archived** ledger filter the row
   shows the **original** title (not A's unsaved edit) and the `Archived` marker; it is frozen (no
   `Edit` link). A's edit produced no row mutation.

### Scenario 2 — Paid By target removed mid-edit (needs MEM-5, now shipped)

A second interleaving on the same form surface. The hazard is a **stale selection** (not
stale-archived state): A's chosen Paid By no longer resolves to a current Member. Unlike Scenario 1
this one **does** reach A's submit, and the **client form blocks it** with a `role="alert"` message.

Setup: as Scenario 1, but B also seeds a third throwaway Member **M**:
`const { memberId: mId } = await seedActiveMemberOnCircle(page, mEmail, "Payer M")`. A records a
Transaction as in Scenario 1.

Interleaving:
1. **A** opens the edit form and **selects M as Paid By** (the Paid By combobox; M appears because
   `listMembers` is reactive and currently includes M). Do not submit yet.
2. **B** removes M: `clickCircleChromeTab(page, "Members")` → `Remove Payer M` →
   alertdialog `Remove member` (the exact flow in members.spec.ts). Await M leaving B's member list.
3. **Await A's reactive member list** — `listMembers` must drop M from A's Paid By `<select>` before
   submit; otherwise the client still resolves M as current and the mutation races the removal (assert
   `form.getByLabel("Paid by").locator("option", { hasText: "Payer M" })` has count 0).
4. **A submits** (`Save changes`). The client `resolvePaidBy`
   ([resolve-paid-by.ts](../../apps/web-app/app/components/transaction-form/resolve-paid-by.ts))
   finds A's newly-selected M is no longer a current Member and isn't the Transaction's existing
   Paid By → returns `{ ok: false }` → the form sets `submitError` and **blocks the save**.
5. **Assert the block**: `await expect(form.getByRole("alert")).toHaveText("The selected payer is no
   longer a member of this circle. Pick a current member.")` (the `STALE_PAID_BY_ERROR` const,
   rendered through `FieldError` which carries `role="alert"` —
   [transaction-form.tsx:32,339](../../apps/web-app/app/components/transaction-form/transaction-form.tsx),
   [field.tsx:133](../../apps/web-app/app/components/ui/field.tsx)). Assert nothing persisted: the
   Transaction's Paid By is unchanged.
6. **Server backstop (no UI assertion needed):** even if the client block were bypassed,
   `updateTransaction` resolves a changed Paid By through `requireCurrentMember`
   ([transactions.ts:457,807](../../packages/convex/convex/transactions.ts)) and rejects a Removed
   Member. Covered by convex-test units; this slice proves the **client** block end to end over a
   **real** reactive `listMembers` flip — the part only a two-context E2E can prove.

**Keep / block asymmetry (mirrors QA-2's archived-Category guard):** *keeping* the Transaction's
existing (now-Removed) Paid By stays an allowed no-op; *newly picking* a Member who is then removed
is blocked. Already unit-covered in
[transaction-form.test.tsx](../../apps/web-app/app/components/transaction-form/transaction-form.test.tsx)
— `it("blocks saving when a newly selected Paid By member is removed mid-edit")` (line ~721) and
`it("still saves a no-op when keeping a now-removed current Paid By")` (line ~739), which mutate the
doubled `listMembers` mid-form. This slice adds the real-backend, two-context proof.

## Why this way

- **Deterministic interleaving over `Promise.all` simultaneity.** A literal "fire both at once"
  race is non-deterministic and flaky in CI; sequencing A-opens → B-acts → assert exercises the exact
  hazard reliably.
- **E2E is the only layer that proves the *user-facing* outcome.** convex-test already asserts the
  mutation rejections in isolation; only the real browser-to-backend path proves the live revocation,
  the snackbar/eject, and the navigation a real Member actually experiences.
- **Anti-enumeration parity (ADR 0016):** the snackbar A sees (`That link isn't available.`) does
  not disclose archived-vs-deleted-vs-access-revoked — same observable outcome for every cause.

## How to test

This slice **is** the test. Assertions, per scenario:

**Scenario 1 (archive vs edit):**
- **Live revocation** — after B archives, A's open edit form shows `That link isn't available.`
  (`aria-live` snackbar, asserted via `getByText`) and navigates back to the ledger with **no
  reload**.
- **No corruption / no partial write** — final Transaction state equals B's archive exactly (original
  title, `Archived` marker, frozen — no `Edit`); A's edited field is absent.
- **Anti-enumeration** — the snackbar copy is the generic closed-vocabulary `link` message.

**Scenario 2 (Paid By removed):**
- **Client block** — A's submit surfaces `STALE_PAID_BY_ERROR` via a `role="alert"` `FieldError`;
  the save does not proceed and Paid By is unchanged.

## Done when

`e2e/transactions-concurrency.spec.ts` is green against the self-hosted Convex backend, asserting
both scenarios: (1) archive-vs-edit live revocation (snackbar + eject) + no corruption; (2) Paid-By
removed-mid-edit client block. Any defect surfaced is fixed at its owning slice with a regression
test. Lint/typecheck/test gates pass.

## Out of scope

The edit and archive features themselves (TXN-2, TXN-3 own them) and Remove Member (MEM-5).
Optimistic-concurrency version tokens / last-write-wins reconciliation (not a v1 mechanism unless a
defect here demands it). Non-Transaction concurrency scenarios — added to this slice incrementally as
their features ship, not built up front. The server-side mutation rejections (already covered by
convex-test units) — this slice proves the *user-facing* path only.
