# OBS-2 · PostHog product analytics

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:observability`, `frontend`, `security` |
| **Depends on** | SET-1 |
| **PRD stories** | 93, 91 |
| **ADRs** | 0013 |
| **Glossary** | — |

## Intent

Product analytics to understand feature usage **safely** (PRD 93, ADR 0013): wire **PostHog**
with **no Session Replay** in v1, **enabled by default after signup legal acceptance**, and
**honoring the Settings opt-out** (SET-1, PRD 91). The hard constraint: **never send financial
content** — no Transaction Title, Note, exact Amount, Feedback free text, or other financial
data (PRD 184). Only coarse feature-usage events.

## Implement

- **Web:** initialize PostHog (key from env) **gated on the User's `analyticsOptOut === false`**;
  no replay (`disable_session_recording`). Provide a thin `track(event, props?)` wrapper that is
  the single capture seam and that **whitelists** allowed props (no free text, no amounts, no
  titles/notes). Default on after legal acceptance; opting out (SET-1) stops capture and
  resets/blocks the client.
- Define the v1 event set (coarse: circle_created, transaction_added (type only, no
  amount/title), category_created, ledger_filter_applied, transaction_search_submitted,
  export_performed, feedback_submitted (type only), etc.). Search/filter events may include safe
  coarse props such as lifecycle status, Transaction type, whether archived/all was selected,
  whether a date range was present, and counts of selected filter values; never include query text,
  category/member names, IDs, titles, notes, or amounts.

## Why this way

- **Single `track` seam with a prop whitelist** makes "no financial content" enforceable and
  testable in one place rather than trusting every call site (PRD 184).
- **Opt-out gates initialization/capture** (SET-1) — but Sentry (OBS-1) is untouched.
- **No replay** in v1 (explicit out-of-scope).

## How to test

- **Opt-out honored:** with `analyticsOptOut: true`, PostHog is not initialized / `track`
  no-ops; default (`false`) captures.
- **No financial content:** assert `track` strips/rejects amount, title, note, feedback text;
  attempting to pass them doesn't transmit them (whitelist test).
- **No replay:** session recording disabled in config.
- **Independence:** Sentry (OBS-1) unaffected by the opt-out; analytics affected.
- **Event set:** representative actions fire the expected coarse events with safe props.

## Done when

- PostHog runs (no replay), default-on post-acceptance, fully gated by the opt-out, capturing
  only whitelisted non-financial props through a single `track` seam; tests green; gates pass.

## Out of scope

Sentry (OBS-1); the opt-out toggle/storage (SET-1); PostHog Session Replay (out of scope v1).
</content>
