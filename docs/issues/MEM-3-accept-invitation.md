# MEM-3 · Accept Invitation + rejoin

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:membership`, `backend`, `ui`, `security` |
| **Depends on** | MEM-2 |
| **PRD stories** | 13, 44 |
| **ADRs** | 0015, 0016, 0018 |
| **Glossary** | Invitation, Invitation Link, Google Account Email, Removed Member |

## Intent

The acceptance gate, and a security-critical one: an Invitation can be accepted **only by a
Google-authenticated User whose current Google Account Email matches the Invitation email**
(PRD 13) — invitations cannot be claimed by the wrong person. Acceptance must also handle
**rejoin**: if the accepting User was previously a Removed Member, reactivate their *existing*
member row (one row per (Circle, User) — never a duplicate) so their historical Transactions
reconnect to their current identity (PRD 44). Failed attempts must not leak whether a Circle
or invite exists (anti-enumeration), and must be throttled (PRD rate-limit line).

The `/invite/:token` public route already exists in the routing skeleton.

## Implement

- **Convex** (`invitations.ts`):
  - `acceptInvitation` mutation: args `{ token }`. Flow: `requireCurrentUser` → hash the token
    → look up by `by_token_hash` → if missing/expired/non-pending → generic "invitation
    invalid" (don't distinguish) and count a throttled failed attempt → compare
    `emailLower` to the User's current Google Account Email; mismatch → generic invalid +
    throttle → load Circle and reject generically if Circle Setup is incomplete
    (`setupCompletedAt === null`) → **upsert membership**: find the (Circle, User) row via
    `by_circle_and_user`; if it exists and is `removed`, flip to `active`, refresh materialized
    `displayName`/`image` from the User, clear `removedAt`; else insert a fresh active member
    row → mark Invitation `accepted` → `recordEvent(circleEntity, action:"member joined",
    changes:[{field:"member", to: <display name>}])`.
  - `getInvitationPreview` query (for the landing screen): by hashed token, returns Circle
    name, Owner display name + image, invited email — **only enough to render the invite
    screen**, and only the generic-invalid signal otherwise.
- **Web:** `/invite/:token` screen showing the preview, an "accept" CTA (requires sign-in
  first; the email-match check is server-side), and a generic failure state.

## Why this way

- **Email match is server-side and based on the live Google Account Email**, not anything the
  client claims (PRD 13). Changing Google email doesn't change existing memberships (glossary).
- **Rejoin reactivates the same row** so `recordedByMemberId`/`paidByMemberId` on old
  Transactions resolve to the rejoined identity automatically (PRD 44) — never create a second
  member row.
- **Single-use:** accepting flips the Invitation to `accepted`; the link can't be reused.
- **Setup complete before join:** acceptance rechecks the Circle before writing membership, so
  a stale invite can never add a non-owner to an incomplete Circle.
- **Generic failures + throttle** so attackers can't enumerate Circles/emails (PRD).

## How to test

- **Happy (new member):** matching-email User accepts → active member row, invite `accepted`,
  join event; link no longer acceptable (reuse ✗).
- **Email mismatch:** different Google email → generic invalid; no membership created;
  attempt throttled.
- **Expired:** past `expiresAt` → generic invalid.
- **Used/revoked:** already-accepted or revoked → generic invalid.
- **Incomplete regular Circle:** pending invite accept ✗ generically; no membership created.
- **Rejoin:** previously Removed Member accepts a fresh invite → the **same** member row
  reactivates (assert id unchanged), identity refreshed, removedAt cleared; their old
  Transactions now resolve to current identity.
- **Anti-enumeration:** missing token vs wrong-email vs expired all return the identical
  generic result.
- **Throttle:** repeated failed attempts are rate-limited without leaking which case occurred.

## Done when

- Only the matching Google email can accept; links are single-use; rejoin reactivates the
  existing row; incomplete Circles cannot be joined; failures are generic + throttled; events
  recorded; comprehensive tests green; gates pass.

## Out of scope

Creating/resending/revoking invitations (MEM-2, MEM-4); the invitation email (EML-2).
</content>
