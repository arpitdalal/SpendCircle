# MEM-5 · Remove Member

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:membership`, `backend`, `ui` |
| **Depends on** | MEM-1 |
| **PRD stories** | 42, 43, 44 |
| **ADRs** | 0015, 0018 |
| **Glossary** | Owner, Removed Member, Recorded By |

## Intent

The Owner can remove a Member from a regular Circle. Removal must **preserve history**: the
Member's Transactions stay in the Circle with their **frozen** Display Name + Profile Picture
(PRD 43), and the Removed Member **loses edit rights** on their Transactions/Categories until
they rejoin (PRD 42, 44). Removal is a status flip on the existing member row — never a delete
— so rejoin (MEM-3) can reactivate the same row and reconnect identity.

## Implement

- **Convex** (`members.ts`):
  - `removeMember` mutation: args `{ circleId, memberId }`. `requireCircleAccess` → Owner-only
    → `assertWritable()` → reject removing the Owner themselves (use MEM-7 transfer first) →
    reject on Personal Circle → flip target member `status:"removed"`, set `removedAt`, **leave
    `displayName`/`image` frozen** (do not clear) → `recordEvent(circleEntity,
    action:"member removed", changes:[{field:"member", from:<display name>}], actor: owner
    membership)`.
  - Edit-rights loss is automatic: TXN-2/CAT-2 compare against the *active* membership, which
    no longer resolves for a removed User.
- **Web:** Owner-only "remove" action in the Member List with confirmation.

## Why this way

- **Status flip, not delete**, preserves the one-row-per-(Circle,User) invariant that makes
  rejoin and frozen identity work (ADR 0018). Never delete the row.
- **Frozen identity:** do not touch `displayName`/`image` on removal — `propagateUserProfile`
  already skips removed rows, so they stay as they were at removal.
- **Owner can't be removed** while Owner — ownership must transfer first (MEM-7), preventing an
  ownerless Circle.

## How to test

- **Permissions:** Owner removes a Member ✓; non-owner ✗; removing self-as-Owner ✗; Personal
  Circle ✗.
- **Frozen identity:** after removal, the Member's name/image stay as they were; a later
  `propagateUserProfile` does NOT update the removed row.
- **Edit-rights loss:** removed Member can no longer edit their Transactions (TXN-2 ✗) or
  Categories (CAT-2 ✗); their Transactions remain visible with frozen creator identity.
- **Rejoin reconnect:** after MEM-3 rejoin, the same row reactivates and edit rights return
  (cross-check with MEM-3).
- **History:** removal recorded with actor (Owner) + affected Member by name, no raw IDs.

## Done when

- Owner can remove Members (not self, not on Personal); identity freezes; edit rights drop and
  return on rejoin; row never deleted; audited; tests green; gates pass.

## Out of scope

Leaving voluntarily (MEM-6); transfer (MEM-7); rejoin mechanics (MEM-3).
</content>
