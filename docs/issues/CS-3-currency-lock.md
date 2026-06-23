# CS-3 · Currency lock after first Transaction

| | |
|---|---|
| **Status** | Done |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | TXN-1 (done) |
| **PRD stories** | 8, 9 |
| **ADRs** | 0009, 0015, 0018 |
| **Glossary** | Currency |

## Intent

A Circle has exactly one Currency and **it locks the moment any Transaction exists** (PRD 9),
so historical totals stay coherent — you can't reinterpret past amounts by switching units.
Before the first Transaction the Owner may still change it; after, the field is immutable.
TXN-1 flips `currencyLocked` on first insert; this slice owns the **enforcement**
(reject currency changes when locked) and the **UI affordance** (let the Owner change it while
unlocked, read-only once locked).

## Shipped

### Backend (`packages/convex/convex/circles.ts`)

- `setCurrency` mutation: Owner-only, `assertWritable`, coded `currency.locked` via
  `MUTATION_ERRORS.currencyLocked`, defensive `transactions` existence check, `isSupportedCurrency` /
  `toCurrencyCode` validation, no-op on unchanged code, `settings_changed` audit with
  `{ field: "currency", from, to }`.

### Domain (`packages/domain/src/mutation-errors.ts`)

- `currencyLocked`: `currency.locked` — "Currency is locked once the circle has a transaction".

### Web

- `useSetCurrency` in `apps/web-app/app/lib/data/circles.ts`.
- Currency section in `apps/web-app/app/routes/circle/settings.tsx`: editable `<select>` when
  unlocked; read-only label + lock explanation when `currencyLocked` or `hasTransactions`.
- `currency: "Currency"` in `FIELD_LABEL` (`history-list.tsx`) for Circle History rendering.

### Tests

- `packages/convex/convex/circles.test.ts` — `setCurrency` describe: unlock path, lock after txn,
  defensive flag mismatch, permissions, validation, history audit.
- `apps/web-app/app/routes/circle/settings.test.tsx` — unlocked selector calls mutation; locked
  read-only for `currencyLocked` and `hasTransactions`.

## Out of scope

Per-Transaction currency / mixed currencies (v1). Any "unlock currency" path. Changing where
currency is first chosen (CS-0 creation flow).
