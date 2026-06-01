# CS-1 · Circle Setup + starter Categories + Currency confirm

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | CS-0, CAT-1 |
| **Unlocks** | — |
| **PRD stories** | 7, 8 |
| **ADRs** | 0015, 0018 |
| **Glossary** | Circle Setup, Residence Type, Currency, Circle Settings |

## Intent

A new Circle should be useful immediately. **Circle Setup** is a *skippable* onboarding step
that gathers optional context (what the Circle is for; for a residence, **Residence Type** —
leased ⇒ Rent, owned ⇒ Mortgage) and from it **derives starter Categories** and **confirms the
Currency** (PRD 7, 8). Shared defaults (Groceries, Dining, Transport, Utilities, Health,
Entertainment, Shopping, Education, Travel) are always useful; context adds the targeted ones.
A Personal Circle can be used before completing setup (glossary).

## Implement

- **Convex** (`circles.ts` or new `circle-setup.ts`):
  - `completeCircleSetup` mutation: args `{ circleId, answers, currency }`. Flow:
    `requireCircleAccess` → Owner-only → `assertWritable()` → if Currency still editable
    (no Transaction yet) and provided, validate (`isSupportedCurrency`) + set → derive the
    starter Category set from `answers` (pure function in `packages/domain`, e.g.
    `starterCategories(answers): {name,type,color}[]`) → create each via the **same uniqueness
    path as CAT-1** (skip any that would collide) → persist setup answers on the Circle (add a
    `setupAnswers` field — needs a schema addition; record an ADR only if the shape is
    surprising) → `recordEvent` for currency confirmation + each derived Category create.
  - Setup answers can be re-edited later (CS-2) and **changing them does not remove existing
    Categories** (glossary: Circle Settings).
- **Domain:** `starterCategories(answers)` — pure, fully unit-tested mapping from answers to
  the category list (residence leased→Rent, owned→Mortgage, plus shared defaults).
- **Web:** a skippable setup step after CS-0 create; optional questions; "skip" leaves the
  Circle usable with no categories.

## Why this way

- **Starter Categories go through the CAT-1 uniqueness path** so setup can't create
  duplicates or violate the per-type case-insensitive rule. Don't bulk-insert raw.
- **Derivation is a pure domain function** so the mapping is testable with zero mocks and
  shared if native ever needs it.
- **Currency only settable while unlocked** — once a Transaction exists the field is locked
  (CS-3); setup must respect that.

## How to test

- **Domain:** `starterCategories` — leased residence includes Rent not Mortgage; owned
  includes Mortgage not Rent; non-residence excludes both; shared defaults always present;
  no duplicate names within the derived set.
- **Mutation:** Owner completes setup → categories created, currency set, events recorded;
  non-owner ✗; archived Circle ✗; deriving a Category whose name already exists → skipped, no
  error; setup on a Circle with a Transaction → currency change rejected, categories still
  derivable (non-colliding).
- **Idempotency/edit:** re-running setup / editing answers does not delete existing Categories.
- **Skip:** skipping creates no Categories and leaves the Circle usable.

## Done when

- Owner can run skippable setup that confirms Currency (while unlocked) and derives
  non-colliding starter Categories via the CAT-1 path; answers persist and are editable
  without dropping Categories; pure derivation tested; gates pass.

## Out of scope

Editing color/mark (CS-2); the currency-lock enforcement mechanics (CS-3).
</content>
