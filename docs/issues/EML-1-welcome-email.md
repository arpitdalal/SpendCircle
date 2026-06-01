# EML-1 · Resend integration + Welcome email

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:email`, `backend`, `security` |
| **Depends on** | F0 |
| **Unlocks** | EML-2, FBK-1 |
| **PRD stories** | 84, 86 |
| **ADRs** | 0008, 0015 |
| **Glossary** | Email Notification |

## Intent

Stand up the **Resend** transactional-email path (ADR 0008) and ship the first email: a
**Welcome email after first sign-in** (PRD 84), sent **once per User** (PRD rate-limit). This is
the shared email-sending seam every later email (Invitation EML-2, Feedback FBK-1) composes
over. v1 sends **only** Invitation + Welcome emails — **no activity emails** (PRD 86), so the
sender must not become a general notification channel.

## Implement

- **Convex** new `packages/convex/convex/email.ts`: a `sendEmail(ctx, { to, template, data })`
  deep module wrapping the Resend API (key from platform env var only). Convex **action**
  (network I/O) invoked from the relevant mutation flows. Single sender = single place for
  vendor wiring, templates, and the MSW mock seam.
  - Welcome: trigger off first User creation (the `onCreateUser` path / bootstrap). Enforce
    **once per User** — record a `welcomeSentAt` (add a field or a guard row) so retries/re-auth
    don't resend.
- **Mocks** (`packages/mocks`): add an MSW handler for the Resend endpoint so tests and mock
  mode never hit Resend. Assert payload shape in tests via the handler.
- **Env:** document the required `RESEND_API_KEY` (+ from-address) as platform env vars.

## Why this way

- **Single `sendEmail` seam** keeps Resend wiring, retries, and the mock in one deep module —
  EML-2 and FBK-1 just pass a template, never re-wire the vendor.
- **Once-per-User Welcome** must be idempotent against re-sign-in — gate on a persisted marker,
  not "is this the first session."
- **MSW for the vendor** (ADR 0006) — tests assert the payload without sending real email; the
  production build still calls Resend.

## How to test

- **Welcome once:** first sign-in/bootstrap sends exactly one Welcome (assert MSW received the
  expected payload: correct `to`, template, no financial content); a second sign-in / repeated
  bootstrap does NOT resend.
- **Sender seam:** `sendEmail` posts the right shape to the Resend handler; a vendor error is
  handled gracefully (doesn't break the triggering mutation's core effect).
- **No activity emails:** assert no email path fires on ordinary Circle activity.
- **Env safety:** no key in code; sender reads from env.

## Done when

- A reusable `sendEmail`/Resend seam exists with an MSW mock; the Welcome email sends exactly
  once per User; no activity emails; payload contains no financial content; tests green; gates
  pass.

## Out of scope

Invitation email (EML-2); Feedback email (FBK-1); in-app notifications (NTF-*).
</content>
