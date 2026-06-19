# EML-2 · Invitation email

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:email`, `backend`, `security` |
| **Depends on** | MEM-2, EML-1 |
| **PRD stories** | 85, 16 |
| **ADRs** | 0008, 0015, 0016 |
| **Glossary** | Invitation, Invitation Link, Email Notification |

## Intent

Deliver the **Invitation Link** by email so non-users can join (PRD 85). The email carries the
**plaintext token** (the only place it exists — MEM-2 stores only the hash) inside the
`/invite/:token` link. Sent on create (MEM-2) and on resend (MEM-4, with the rotated token).
Rate limits from MEM-4 apply (≤3 resend/day/Circle+email, ≤100 invitation emails/User/day).

## Implement

- **Convex** (`invitations.ts` + `email.ts`):
  - Compose an Invitation template (Circle name, Owner Display Name + image, invited email, the
    `/invite/:token` link with the plaintext token) and send via `sendEmail` (EML-1) from the
    `createInvitation` and `resendInvitation` flows. These become **actions** (or schedule an
    action) since email is network I/O.
  - The plaintext token is passed straight from create/resend to the email send and never
    persisted or returned to general clients.
  - **Idempotency key (EML-3 seam):** pass `sendEmail`'s `idempotencyKey` so a retried send
    dedupes at Resend instead of re-delivering. **Scope the key to the individual invitation,
    not the user** — key on the invitation id (preferred: `invite:${invitationId}`) or, for a
    resend with a rotated token, include the token generation so the new link is allowed to
    send (e.g. `invite:${invitationId}:${tokenVersion}`). A user can be invited to **many
    Circles in a short window** and each is a distinct, legitimate email — a user-scoped key
    (`invite:${userId}`) would wrongly collapse them into one delivery. Resend retains keys 24h,
    so distinct keys are required for distinct emails sent within a day.
- **Mocks:** reuse EML-1's Resend MSW handler; assert the invitation payload + that the link
  contains a token + that the `Idempotency-Key` header is per-invitation (two invitations to the
  same user → two different keys → two sends).

## Why this way

- **Token only in the email link** (ADR 0016): create/resend mint the plaintext, hand it to
  `sendEmail`, and forget it. The DB holds only the hash. A leaked DB yields no working links.
- **Reuses the EML-1 sender** — no new vendor wiring. Inherits EML-3's durable retry + the
  `idempotencyKey` param; invitations supply a **per-invitation** key (see Implement) — unlike
  the once-per-user Welcome email, invitations are intentionally **not** user-idempotent.
- **Resend rotates the token** (MEM-4) → the email always carries the current, single-valid link.
  A resend must reach Resend (not be deduped against the prior token), so its key includes the
  token generation.

## How to test

- **Send on create:** `createInvitation` triggers one invitation email with the correct
  Circle/Owner/email and a link containing a token (assert via MSW); token not persisted in
  plaintext.
- **Send on resend:** `resendInvitation` sends with the **new** token; the old link no longer
  accepts (cross-check MEM-3). The resend reaches Resend (its key differs from the prior send's,
  so it is not deduped).
- **Per-Circle idempotency:** the same user invited to two Circles within 24h gets **two** emails
  (distinct keys); a retry of a *single* invitation send dedupes to one delivery (same key).
- **Rate limits:** email not sent beyond MEM-4 caps; over-cap attempts blocked before send.
- **Content:** no financial content; correct from-address; invited email is the recipient.
- **Vendor failure:** handled without corrupting the Invitation row.

## Done when

- Creating/resending an Invitation emails the current single-use link (token only in the email)
  via the EML-1 sender, within rate limits, with no plaintext-token persistence; tests green;
  gates pass.

## Out of scope

Creating/resending/accepting invitations (MEM-2/3/4); the email seam itself (EML-1).
</content>
