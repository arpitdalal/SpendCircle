# MEM-2 · Invite by email

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:membership`, `backend`, `ui`, `security` |
| **Depends on** | MEM-1 |
| **Unlocks** | MEM-3, MEM-4, MEM-8, MEM-9, EML-2 |
| **PRD stories** | 12, 16 |
| **ADRs** | 0015, 0016, 0018 |
| **Glossary** | Invitation, Invitation Link, Owner |

## Intent

An Owner invites a person by **email** to join a *regular* Circle (never a Personal Circle —
it's always solo). The invite produces a single-use **Invitation Link** that **expires after
7 days** (PRD 16). The token is opaque and **stored only as a hash** (`invitations.tokenHash`)
— the plaintext lives solely in the emailed link (ADR 0016 anti-enumeration), so a leaked DB
never yields working links. This slice creates the Invitation + token; sending the email is
EML-2, accepting is MEM-3.

## Implement

- **Convex** new `packages/convex/convex/invitations.ts`:
  - `createInvitation` mutation: args `{ circleId, email }`. `requireCircleAccess` → Owner-only
    → `assertWritable()` → reject if Circle Setup is incomplete (`setupCompletedAt` missing)
    → reject if Circle is Personal (`kind === "personal"`) → normalize `emailLower` → reject
    if that email is already an **active Member** or has a **pending** Invitation (resend is
    MEM-4, not a second create) → generate a cryptographically random opaque token, store
    `tokenHash` (hash via a server util; never store plaintext) → insert with
    `status:"pending"`, `expiresAt = now + 7d`, `resendCount: 0`,
    `invitedByUserId` → `recordEvent(circleEntity, action:"member invited",
    changes:[{field:"email", to: email}])` → return the plaintext token to the caller **only
    for the email send path** (EML-2), not to general clients.
- **Web:** Owner-only invite form (email input) on the Member management surface. Show a
  pending state; the actual email send is EML-2 (until then, surface the link in dev/mock).

## Why this way

- **Hash the token, never store plaintext** — the link is a bearer credential; the DB must not
  be able to mint one. Acceptance (MEM-3) hashes the incoming token and looks up by
  `by_token_hash`.
- **Personal Circles reject invites** at the server, structurally (kind check) — the
  always-solo invariant is enforced, not just hidden.
- **Incomplete Circles reject invites** at the server — setup gates `/members` in the UI, but
  the mutation must also enforce that no non-owner can join an incomplete Circle.
- **Create ≠ resend:** a pending invite for the same email must not spawn a second row; resend
  (MEM-4) mutates the existing one and rotates the token.

## How to test

- **Happy:** Owner invites a new email → pending Invitation with hashed token, 7-day expiry,
  invite event recorded; plaintext token never persisted (assert stored value ≠ token).
- **Permissions:** non-owner Member ✗; Removed Member ✗; non-member ✗; unauthenticated ✗.
- **Personal Circle:** invite ✗ (structural).
- **Incomplete regular Circle:** invite ✗ until `setupCompletedAt` is set.
- **Duplicates:** inviting an existing active Member ✗; inviting an email with a pending
  invite ✗ (directs to resend); inviting an email of a Removed Member ✓ (re-invite allowed).
- **Lifecycle:** invite on an archived Circle ✗.
- **Expiry:** `expiresAt` is exactly 7 days out.

## Done when

- An Owner can create a hashed, 7-day, single-use Invitation for a regular Circle; Personal
  Circles, incomplete Circles, and duplicates rejected; event recorded; token never stored in
  plaintext; tests green; gates pass.

## Out of scope

Sending the email (EML-2); accept (MEM-3); resend/revoke/list (MEM-4).
</content>
