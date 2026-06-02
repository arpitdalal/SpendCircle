# QA-2 · Archived-category-mid-creation e2e validation

| | |
|---|---|
| **Status** | Todo |
| **Depends on** | TXN-1, CAT-2 |
| **Unlocks** | — (terminal regression guard; sibling of [QA-1](QA-1-concurrency-validation.md)) |
| **PRD stories** | 57 |
| **ADRs** | 0015, 0016, 0019 |
| **Glossary** | Category, Transaction, Archive, active, Recorded By |

## Intent

Lock in — as an executable, real-backend regression guard — the exact behavior shipped for the
"archived category mid-creation" edge: when a **Category a user already selected** in an open
Create-Transaction form is **archived by another Member before submit**, the form must

1. keep that Category **visible** (badged "archived", still deselectable) — **never silently drop
   it** from the selection, and
2. **block submit** with a clear, accessible message, because an archived Category **cannot be
   newly added** to a new Transaction (PRD story 57).

This is the asymmetry PRD 57 intends: archived Categories *stay attached to existing Transactions
and may remain through edits, but cannot be newly added*. So "selected-then-archived during
creation" is a **new add** → blocked, whereas "created-then-archived" keeps the Category on the
record (shown archived). The product decision and the reasoning are recorded in the PR discussion
that introduced this guard (review flagged a silent-drop; we chose to keep-visible-and-block
rather than relax the server rule).

It exists as its own slice rather than folding into [QA-1](QA-1-concurrency-validation.md) because
its dependency set is different and **already satisfiable** (`TXN-1` is shipped; it needs only
`CAT-2`'s archive flow), so it is independently grabbable now instead of waiting on QA-1's
`TXN-2`/`TXN-3`. Both are members of the concurrency/stale-state validation family.

## Why e2e (not just the component test)

A component test already covers the keep-visible + block contract by mutating a **mocked**
`listCategories` to flip the Category to archived mid-render
([transactions.test.tsx](../../apps/web-app/app/routes/circle/transactions.test.tsx)). Only a
real-backend e2e (ADR 0019) proves the parts the mock can't:

- the **reactive** `listCategories({ includeArchived: true })` query actually re-renders the open
  form when another session archives the Category (the live flip, not a simulated rerender);
- the **server's own** archived-Category rejection in `createTransaction` (PRD 57 / ADR 0015) is
  intact as the backstop even if the client guard regressed;
- **nothing is silently persisted** — the live ledger never gains the blocked Transaction.

As more surfaces reuse the transaction form (`TXN-2` edit, `CAT-3` inline Category create, `RPT-*`
filters), this guard ensures the contract survives their refactors.

## Implement

- **E2E** (`e2e/transactions-archived-category.spec.ts`): real self-hosted backend, the
  `E2E_TEST_AUTH` session bypass (ADR 0019). Two browser contexts of the **same Circle** model the
  concurrency cleanly — **A = Recorded By** (filling the form), **B** = a Member who archives the
  Category (the Personal Circle's single owner can play both via two contexts if a second Member
  isn't seeded; otherwise seed an owner + member).
- **Seed**: a Circle with one **active** expense Category (create via CAT-1's flow in the
  bootstrapped Personal Circle — no CS-0 needed).
- **Deterministic interleaving (not a simultaneous race):**
  1. A: Transactions → **Add expense**, fill Title + Amount, **select the Category** while active.
     Do not submit.
  2. B: archive that Category via the Categories surface (CAT-2 archive flow); **await** it.
  3. A's open form (reactive `listCategories`): assert the Category now renders **badged
     "archived"** and is **still selected** (not dropped), and the explain message is shown.
  4. A: press **Add expense** → assert the live ledger does **not** gain the Transaction (blocked)
     and the message persists.
  5. A: deselect the archived chip → assert it's removed; (optional) pick a remaining active
     Category and assert submit then succeeds.

## Why this way

- **Deterministic ordering** (A-selects → B-archives → A-submits) exercises the real hazard
  without the CI flake of a true simultaneous race.
- Driving the **real reactive query** is the whole point — it proves the `includeArchived`
  widening + status flip actually reach the open form, which a mocked rerender cannot.
- The **server reject** stays the authority (ADR 0015); the client block is a courtesy on top.

## How to test

The spec's assertions:

- **Kept visible** — after B archives, the Category still renders (badged archived) in A's form;
  the selection is not silently emptied.
- **Blocked** — pressing Add expense with the archived Category selected creates nothing (no new
  ledger `listitem`; `listTransactions` does not include it).
- **Explains** — an accessible (`role="alert"`) message names the archived Category and says it
  can't be added to a new Transaction.
- **Recoverable** — deselecting the archived chip removes it and the message; with a remaining
  active Category, submit then succeeds.
- **Server backstop** — covered by `packages/convex/convex/transactions.test.ts` (create rejects
  an archived Category); reference it, no need to re-drive through the UI.

## Done when

`e2e/transactions-archived-category.spec.ts` is green against the self-hosted backend asserting
keep-visible + block + explain + recover for a Category archived mid-creation; gates pass.

## Out of scope

Changing PRD 57 (archived Categories remain forbidden on create — this slice *guards* that rule).
The create form itself (`TXN-1`) and Category archive (`CAT-2`) it builds on. Display of archived
Categories on *existing* Transactions (`TXN-4` / `RPT-*`).
