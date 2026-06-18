# MEM-4 · Manage Invitations: list / resend / revoke

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:membership`, `backend`, `ui`, `security` |
| **Depends on** | MEM-2 |
| **Unlocks** | MEM-8 |
| **PRD stories** | 14, 15, 17 |
| **ADRs** | 0015, 0016, 0018 |
| **Glossary** | Invitation, Invitation Link, Owner |

## Intent

Membership management is **private to the Owner**: only the Owner can see pending Invitations
(PRD 14). The Owner can **resend** (rotating to a fresh single-use link, invalidating older
ones — PRD 15) and **revoke** a pending Invitation (PRD 17). Resend is rate-limited: **≤3/day
per Circle+email**, and **≤100 invitation emails/User/day** overall (PRD rate-limits).

## Implement

- **Convex** (`invitations.ts`):
  - `listPendingInvitations` query: `requireCircleAccess` → **Owner-only** (non-owners get
    `null`/empty, never a leak) → pending invites for the Circle (email, createdAt, expiresAt,
    resendCount; **never the token/hash**).
  - `resendInvitation` mutation: Owner-only → `assertWritable()` → load pending invite →
    reject if Circle Setup is incomplete (`setupCompletedAt === null`) → enforce caps (≤3/day
    this Circle+email via `resendCount`/time window; ≤100/day this User) → generate a **new**
    token, overwrite `tokenHash` (older link now invalid since lookup is by current hash), bump
    `resendCount`, refresh `expiresAt` to now+7d → record event → return plaintext token for
    EML-2.
  - `revokeInvitation` mutation: Owner-only → `assertWritable()` → set `status:"revoked"`
    (link no longer acceptable) → record event.
- **Web:** Owner-only pending-invitations list with resend/revoke actions and rate-limit
  feedback.

## Why this way

- **Owner-only at the server**, not just hidden — pending invites are private (PRD 14).
- **Resend rotates the hash**, so MEM-3's `by_token_hash` lookup of an old link simply misses
  → generic invalid. That's how "only the latest unexpired link can be accepted" is enforced
  without tracking old tokens.
- **No invite flow on incomplete Circles:** resend has the same setup-complete guard as create
  and accept, so a stale pending Invitation cannot be refreshed before setup finishes.
- **Caps enforced server-side** with clear, non-enumerating errors.

## How to test

- **Visibility:** Owner sees pending invites ✓; non-owner Member ✗ (empty/null); non-member ✗.
- **Resend:** rotates token (old link no longer accepts — verify via MEM-3 accept with old
  token ✗, new token ✓); refreshes expiry; bumps count; records event.
- **Revoke:** pending → revoked; subsequent accept ✗ (generic invalid); event recorded.
- **Rate limits:** 4th resend same Circle+email within a day ✗; 101st invitation email/day for
  a User ✗; limits reset across the day boundary.
- **Incomplete regular Circle:** resend pending invite ✗ until `setupCompletedAt` is set.
- **Lifecycle/permissions:** resend/revoke on archived Circle ✗; non-owner ✗.

## Done when

- Owner-only listing; resend rotates + caps; revoke invalidates; all rate limits enforced
  server-side; incomplete Circles cannot refresh invite links; events recorded; comprehensive
  tests green; gates pass.

## Out of scope

Sending emails (EML-2); archive-driven bulk revoke (MEM-8 calls revoke logic).
</content>
