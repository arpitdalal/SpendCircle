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
- **Mocks:** reuse EML-1's Resend MSW handler; assert the invitation payload + that the link
  contains a token.

## Why this way

- **Token only in the email link** (ADR 0016): create/resend mint the plaintext, hand it to
  `sendEmail`, and forget it. The DB holds only the hash. A leaked DB yields no working links.
- **Reuses the EML-1 sender** — no new vendor wiring.
- **Resend rotates the token** (MEM-4) → the email always carries the current, single-valid link.

## How to test

- **Send on create:** `createInvitation` triggers one invitation email with the correct
  Circle/Owner/email and a link containing a token (assert via MSW); token not persisted in
  plaintext.
- **Send on resend:** `resendInvitation` sends with the **new** token; the old link no longer
  accepts (cross-check MEM-3).
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
