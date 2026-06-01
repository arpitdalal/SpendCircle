# CS-3 · Currency lock after first Transaction

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | TXN-1 |
| **PRD stories** | 8, 9 |
| **ADRs** | 0009, 0015, 0018 |
| **Glossary** | Currency |

## Intent

A Circle has exactly one Currency and **it locks the moment any Transaction exists** (PRD 9),
so historical totals stay coherent — you can't reinterpret past amounts by switching units.
Before the first Transaction the Owner may still change it; after, the field is immutable.
TXN-1 flips `currencyLocked`; this slice owns the **enforcement** (reject currency changes
when locked) and the UI affordance.

## Implement

- **Convex** (`circles.ts`):
  - `setCurrency` mutation (or extend settings): `requireCircleAccess` → Owner-only →
    `assertWritable()` → if `circle.currencyLocked` → throw "Currency is locked" → validate
    `isSupportedCurrency` → patch → `recordEvent` (currency from/to).
  - Ensure the lock flips **transactionally with the first Transaction** — verify TXN-1 sets
    `currencyLocked = true` on first insert; if not present, add it. Also defensively re-check
    in `setCurrency` whether any Transaction exists (don't trust only the flag) to close races.
- **Web:** Currency selector enabled only while unlocked; once locked, show it read-only with
  an explanation. Circle Setup (CS-1) currency confirm respects the same lock.

## Why this way

- **Flag + defensive existence check:** the `currencyLocked` flag is the fast path, but
  `setCurrency` should also confirm no Transaction exists before allowing a change, so a
  missed flag flip can never corrupt historical totals.
- Lock is permanent in v1 (no unlock path) — there's no "unlock currency" story.

## How to test

- **Lock trigger:** Circle with no Transactions → Owner changes currency ✓; create a
  Transaction → `currencyLocked` true → Owner changes currency ✗ ("Currency is locked").
- **Defensive check:** with `currencyLocked` artificially false but a Transaction present,
  `setCurrency` still rejects.
- **Permissions:** non-owner ✗; archived Circle ✗.
- **Validation:** unsupported currency code ✗ even while unlocked.
- **History:** an allowed currency change records from/to.

## Done when

- Currency is editable only before the first Transaction and permanently locked after, with a
  defensive existence check; UI reflects lock; audited; tests green; gates pass.

## Out of scope

Per-Transaction currency / mixed currencies (explicitly out of scope for v1).
</content>
