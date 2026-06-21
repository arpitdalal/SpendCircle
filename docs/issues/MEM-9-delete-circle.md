# MEM-9 · Delete empty Circle

| | |
|---|---|
| **Status** | Done |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | MEM-2, TXN-1 |
| **PRD stories** | 23 |
| **ADRs** | 0015, 0016 |
| **Glossary** | Archived Circle |

## Intent

Abandoned setup work shouldn't become permanent noise: an Owner can **delete** a regular Circle
**only when it is truly empty** — exactly **one Member and no Transactions ever created** (PRD
23). Anything with history is archived (MEM-8), never deleted. Deletion also revokes pending
Invitations + invalidates links (PRD 22 applies to delete too). A Personal Circle can never be
deleted (glossary).

"No Transactions ever created" means none exist now — including archived ones — since archived
Transactions still represent history. "Exactly one Member" likewise means exactly **one member
row of any status** — a *removed* member row is membership history, so its presence means archive,
not delete.

## Shipped

### Backend (`packages/convex/convex/circles.ts`)

- **`deleteCircle`** — owner-only; rejects Personal, multi-member, or any-transaction circles
  with coded `ConvexError`s; cascades members, categories, invitations, circle/category
  histories, and `e2eInvitationTokens`; retains `invitationEmailEvents` (ADR 0026 rate-limit
  ledger); no `recordEvent` (entity ceases to exist).
- **`circleHasTransactions`** — minimal boolean query for the settings UI gate (`null` when
  inaccessible).

### Domain (`packages/domain/src/mutation-errors.ts`)

- `circle.delete.forbidden`, `circle.delete.personal`, `circle.delete.hasMembers`,
  `circle.delete.notEmpty` — user-facing messages guide toward archive where appropriate.

### Web

- `useDeleteCircle` / `useCircleHasTransactions` in `app/lib/data/circles.ts`.
- Danger-zone **Delete circle** on `app/routes/circle/settings.tsx` — shown only for empty
  regular circles; archive guidance when history exists; confirm dialog; success → `/`.

### Tests

- Convex: `packages/convex/convex/circles.test.ts` (`deleteCircle`, `circleHasTransactions`).
- Web: `apps/web-app/app/routes/circle/settings.test.tsx` (delete flow, coded errors, guidance).

## Done when

- Owner can delete only a strictly-empty regular Circle (1 member row, 0 Transactions any status),
  cascading every dependent row (members, categories, invitations, related histories, e2e tokens)
  while retaining the invitation rate-limit ledger; everything else refuses with a coded error toward
  archive; invite links die; caller lands on `/`; tests green; gates pass.

## Out of scope

Archiving non-empty Circles (MEM-8 — shipped separately); cleaning up `notifications` whose links
point at the deleted Circle.
