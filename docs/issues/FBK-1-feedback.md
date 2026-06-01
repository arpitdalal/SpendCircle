# FBK-1 · Feedback

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:feedback`, `backend`, `ui`, `security` |
| **Depends on** | EML-1 |
| **PRD stories** | 89 |
| **ADRs** | 0008, 0013, 0015 |
| **Glossary** | Feedback |

## Intent

In-app **Feedback** lets a User report a bug or request a feature/currency (PRD 89). It has a
**type**, a **required message**, optional **current Circle context**, and auto-includes the
User's email, Display Name, and app build info when available. It **sends an email to a
configured support address** via Resend and **creates no app data inside a Circle** (glossary).
Rate-limited to **≤20/User/day** (PRD rate-limit). Crucially, Feedback free text must **not** be
sent to analytics (PRD 184) — it can contain anything.

## Implement

- **Convex** new `packages/convex/convex/feedback.ts`:
  - `submitFeedback` mutation/action: `requireCurrentUser` → validate type ∈ allowed,
    message required/non-empty/max length → enforce **≤20/day/User** rate limit server-side →
    compose payload (type, message, optional Circle name as context, User email/display name,
    app build/version) → `sendEmail` (EML-1) to the configured support address (env var) → does
    NOT write into any Circle.
- **Web:** a Feedback entry point (type select, message, auto-attached context shown), success/
  rate-limit states.

## Why this way

- **No app data created** — Feedback is purely an outbound email; don't model it as a Circle
  entity.
- **Rate limit server-side** (≤20/day/User) with a clear non-leaking error.
- **Free text never to analytics** — keep Feedback content out of any PostHog capture (OBS-2);
  only a coarse "feedback_submitted" event with type at most.
- Reuses the EML-1 sender — support address from env.

## How to test

- **Happy:** valid feedback emails the support address with the right payload (assert via MSW),
  including auto-context (email, name, build, optional Circle name); creates no Circle rows.
- **Validation:** empty/whitespace message ✗; invalid type ✗; over-max message ✗.
- **Rate limit:** 21st submission in a day ✗; resets across the day boundary.
- **Privacy:** assert the payload to **analytics** (if any event fires) contains no message free
  text, email, or Circle financial content.
- **Auth:** unauthenticated ✗.

## Done when

- A User can submit type+message feedback (with optional Circle context + auto build info) that
  emails support, within ≤20/day, creating no app data and leaking no free text to analytics;
  tests green; gates pass.

## Out of scope

The email seam (EML-1); analytics wiring (OBS-2).
</content>
