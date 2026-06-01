# MEM-8 · Archive / Restore Circle

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:circles`, `area:membership`, `backend`, `ui` |
| **Depends on** | MEM-4 |
| **PRD stories** | 20, 21, 22, 26 |
| **ADRs** | 0015, 0016, 0018 |
| **Glossary** | Archived Circle, Owner |

## Intent

An Owner archives a finished regular Circle so it stops cluttering active views (PRD 20).
Archiving makes the Circle **read-only** for everyone — current Members can still view and
search history but cannot add/edit/delete Transactions, Categories, or membership (PRD 21) —
and the read-only state must apply **live** (a Member viewing it when it's archived is moved to
the read-only archived view — PRD 26). Archiving also **revokes pending Invitations and
invalidates their links** (PRD 22). A Personal Circle cannot be archived (glossary).

The read-only enforcement already exists structurally: `assertWritable()` throws on a
non-active Circle, and every mutation calls it. This slice flips the status, cascades invite
revocation, and ensures the UI reacts live.

## Implement

- **Convex** (`circles.ts`):
  - `archiveCircle` mutation: `requireCircleAccess` → Owner-only → reject Personal → set
    `status:"archived"`, `archivedAt` → **revoke all pending Invitations** for the Circle
    (reuse MEM-4 revoke logic; their `by_token_hash` becomes unacceptable) → `recordEvent`.
  - `restoreCircle` mutation: Owner-only → set `status:"active"`, clear `archivedAt` →
    `recordEvent`. (Restore does NOT un-revoke invitations — they stay revoked; Owner re-invites.)
  - Audit: confirm every other mutation's `assertWritable()` covers the read-only rule (it
    does by construction) — add tests rather than new guards.
- **Web:** Owner archive/restore action; archived Circles render in a read-only archived view;
  ensure the live query flips the shell to read-only without reload.

## Why this way

- **Read-only is already enforced by `assertWritable()`** in every mutation — this slice
  proves it with tests across all mutation types rather than re-implementing guards.
- **Live read-only** comes free from reactive `useQuery` returning the new `status`; the UI
  must key its read-only mode off the live Circle, not a one-time load.
- **Archive revokes invites** so an archived Circle can't be joined (PRD 22); restore leaves
  them revoked (no silent reactivation of stale links).

## How to test

- **Permissions:** Owner archives/restores ✓; non-owner ✗; Personal Circle ✗.
- **Read-only cascade:** against an archived Circle, assert **every** mutation type is rejected
  — createTransaction, updateTransaction, archiveTransaction, createCategory, updateCategory,
  rename, settings, invite, remove, transfer — all ✗; reads (ledger, search, history) ✓.
- **Invite revocation:** pending invites become `revoked` on archive; accepting a pre-archive
  link ✗ (generic invalid); restore does not un-revoke.
- **Live:** a subscribed Circle query flips to archived/read-only after archive without reload.
- **History:** archive/restore events recorded.

## Done when

- Owner can archive/restore a regular Circle; archived ⇒ fully read-only (proven across all
  mutations) and live; pending invites revoked on archive; audited; tests green; gates pass.

## Out of scope

Deleting an empty Circle (MEM-9); the archive-only search filter (RPT-2).
</content>
