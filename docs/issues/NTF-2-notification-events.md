# NTF-2 · Notification creation on events

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:notifications`, `backend` |
| **Depends on** | NTF-1 (and the event-emitting slices: MEM-3/5/7/8, TXN-1/3, CAT-2) |
| **PRD stories** | 81 |
| **ADRs** | 0015, 0018 |
| **Glossary** | Notification Center |

## Intent

The fan-out slice — build it **last** (Tier 4), once the actions that emit events exist. v1
Notifications are **focused on events that directly involve the User** (glossary): Invitation
accepted/revoked/expired involving them; being added to / removed from a Circle; ownership
transferred to/from them; Circle archived/restored for a Circle they belong to; a Transaction
recorded with **Paid By set to them by another Member**; **their** Transaction archived/restored
by the Owner; **their** Category archived/restored by the Owner. Each is created server-side at
the moment the action happens.

## Implement

- **Convex** new `packages/convex/convex/notify.ts`: a single deep module
  `notifyUser(ctx, { userId, type, title, body?, link? })` that inserts a `notifications` row —
  the **sole writer**, mirroring how `recordEvent` is the sole audit writer. Provide typed
  constructors per event so call sites read clearly and links are canonical.
- **Wire call sites** into the existing mutations (this is the bulk of the slice):
  - MEM-3 accept → notify the inviting Owner ("invitation accepted"); MEM-4 revoke → notify the
    invitee if they're a User; expiry → notify on expiry detection.
  - MEM-5 remove / MEM-3 add → notify the affected User.
  - MEM-7 transfer → notify both old and new Owner.
  - MEM-8 archive/restore → notify Circle Members.
  - TXN-1 → if Paid By ≠ Recorded By, notify the Paid By User ("you were set as Paid By").
  - TXN-3 → notify the Transaction's Recorded By when the Owner archives/restores it.
  - CAT-2 → notify the Category creator when the Owner archives/restores it.
- Links are the canonical in-app paths (resolved for accessibility at read time by NTF-1).

## Why this way

- **Single writer (`notifyUser`)** keeps notification shape + link conventions in one place and
  testable, exactly like `recordEvent`. No scattered `db.insert("notifications")`.
- **Created at the action site, server-side** (ADR 0015) — the mutation that performs the action
  also emits the notification, in the same transaction, so they can't diverge.
- **Only User-involving events** — don't notify on generic Circle activity (PRD 86: no activity
  spam).

## How to test

- **Per event type:** performing each action creates exactly the right notification(s) for the
  right User(s) with a correct type, title, and canonical link; no notification for the actor
  where the spec says the *involved* party (e.g. Paid By only notifies when set by *another*
  Member).
- **No over-notification:** ordinary Transaction creation with Paid By = self → no notification;
  a Member editing their own data → no notification.
- **Link correctness:** the stored link resolves to the right object and is access-checked by
  NTF-1 (cross-check: notify, lose access, link becomes text-only).
- **Idempotency/duplication:** a single action emits a single notification (no dupes on retry
  semantics).

## Done when

- Every v1 user-involving event emits the correct notification via the single `notifyUser`
  writer at its action site; no activity spam; comprehensive per-event tests green; gates pass.

## Out of scope

The center/read-state UI (NTF-1); emails (EML-*).
</content>
