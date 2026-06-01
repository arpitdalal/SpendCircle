# MEM-9 · Delete empty Circle

| | |
|---|---|
| **Status** | Todo |
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
Transactions still represent history.

## Implement

- **Convex** (`circles.ts`):
  - `deleteCircle` mutation: `requireCircleAccess` → Owner-only → reject Personal → assert
    **exactly one Member** (the Owner) → assert **zero Transactions** of any status for the
    Circle (query `by_circle`, any row ⇒ reject) → revoke pending Invitations → delete the
    Circle and its dependent rows (the single member row, any Categories, the now-revoked
    invitations, the Circle's history rows) → no `recordEvent` (the entity is gone). Consider
    whether Circle History should be retained — per PRD, a truly-empty Circle has only
    setup-era events; deleting them is acceptable since the entity ceases to exist.
- **Web:** Owner-only "delete" action available **only** when the empty conditions hold (and
  enforced server-side regardless); confirm destructive action; navigate to safe fallback.

## Why this way

- **Strict emptiness, checked server-side:** one Member AND zero Transactions of *any* status.
  The flag/heuristic isn't enough — query Transactions directly.
- **Delete vs archive is a hard fork:** if any Transaction exists, the correct action is
  archive (MEM-8); `deleteCircle` must refuse, guiding the Owner to archive.
- **Hard delete is irreversible** — gate it behind the strict check and a confirmation; this is
  the one place we remove data, so be conservative.

## How to test

- **Happy:** Owner deletes a one-Member, zero-Transaction regular Circle → Circle + its member/
  category/invitation/history rows gone; pending invites revoked first; caller redirected.
- **Refusals:** delete with ≥1 Transaction (active OR archived) ✗ (suggest archive); delete with
  ≥2 Members ✗; delete Personal Circle ✗; non-owner ✗; unauthenticated ✗.
- **Anti-enumeration:** deleting a non-existent/inaccessible Circle → generic not-found.
- **No dangling rows:** assert no orphaned members/categories/invitations/history remain.

## Done when

- Owner can delete only a strictly-empty regular Circle (1 Member, 0 Transactions any status),
  cascading dependent rows and revoking invites; everything else refuses toward archive; tests
  green; gates pass.

## Out of scope

Archiving non-empty Circles (MEM-8).
</content>
