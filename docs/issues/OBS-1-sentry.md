# OBS-1 · Sentry error monitoring

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:observability`, `frontend`, `security` |
| **Depends on** | F0 |
| **PRD stories** | 92 |
| **ADRs** | 0012, 0013 |
| **Glossary** | — |

## Intent

Operational error monitoring from beta (PRD 92, ADR 0012): wire **Sentry** with **strict masked,
error-triggered Session Replay only** — **no normal replay sampling**. Sentry is **always on**,
independent of the product-analytics opt-out (ADR 0013 / PRD 181) — it's how beta issues get
diagnosed. There's already a `reportAppError` seam (`report-error.ts`) noting "Sentry later";
this slice makes it real.

## Implement

- **Web:** initialize Sentry in the SPA entry (client). Config: error monitoring on; Session
  Replay **maskAllText/blockAllMedia**, `replaysSessionSampleRate: 0`,
  `replaysOnErrorSampleRate` > 0 only — replays trigger on errors, never sampled normally.
  DSN from env var. Route `reportAppError` through to Sentry (keep the console warning in dev).
- **Privacy:** ensure replay masking prevents any financial content/PII from being captured;
  scrub sensitive fields.
- **Env:** document `SENTRY_DSN` (+ environment/release tags from build metadata).

## Why this way

- **Error-only replay, fully masked** (PRD 92) — no ambient session recording; replays exist
  only to debug an actual error and must not leak financial data.
- **Independent of opt-out** (ADR 0013): the analytics toggle (SET-1) must NOT gate Sentry.
- **Route through `reportAppError`** so the existing seam becomes the single client-error
  funnel.

## How to test

- **Config:** session sample rate is 0, on-error replay rate > 0, masking flags on (assert the
  init options).
- **Independence:** with analytics opted out, Sentry init still runs (assert it's not gated by
  the opt-out).
- **Seam:** `reportAppError` forwards to Sentry capture (mock the SDK); dev still logs.
- **Privacy:** masking options ensure text/media are masked (assert config).
- **Build elimination:** DSN absent in dev/mock → Sentry no-ops without errors.

## Done when

- Sentry runs from beta with masked, error-only replay (no normal sampling), always-on
  regardless of opt-out, fed by `reportAppError`, with no financial-content capture; tests
  green; gates pass.

## Out of scope

Product analytics (OBS-2); the opt-out toggle (SET-1).
</content>
