# SET-1 · Settings: App Version + analytics opt-out

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:settings`, `backend`, `ui` |
| **Depends on** | F0 |
| **Unlocks** | OBS-2 |
| **PRD stories** | 90, 91 |
| **ADRs** | 0013, 0015 |
| **Glossary** | App Version |

## Intent

The Settings surface for two v1 concerns: show the **App Version / build** so support can
diagnose problems (PRD 90), and a **product-analytics opt-out** under Settings → Privacy (PRD
91). Opt-out disables **product** analytics (PostHog, OBS-2) but **never** operational error
monitoring (Sentry, OBS-1) — that stays on regardless (ADR 0013, PRD 181). The `users` schema
already has `analyticsOptOut`; a `setAnalyticsOptOut` mutation may already exist — verify and
wire the UI.

## Implement

- **Convex** (`users.ts`): ensure `setAnalyticsOptOut` mutation exists: `requireCurrentUser` →
  patch `analyticsOptOut`. Expose the current value via the user/session query.
- **Web:** Settings route (the placeholder `routes/settings.tsx`): a Privacy section with the
  opt-out toggle bound to the mutation + current value, and an About section showing App Version
  / build id (from build-time env / `react-router.config` or a version constant). The opt-out
  value gates PostHog init in OBS-2.

## Why this way

- **Opt-out is product-analytics only** — keep Sentry independent (ADR 0013). Don't let one
  toggle disable error monitoring.
- **App Version from build metadata**, not hardcoded — so it reflects the deployed build (also
  attached to Feedback, FBK-1).
- Default analytics **on** after signup legal acceptance (PRD 183); opt-out flips it off.

## How to test

- **Opt-out:** toggling persists `analyticsOptOut`; reading reflects it; default is `false`
  (on) for a freshly bootstrapped User.
- **Independence:** opting out does not affect Sentry config (assert OBS-1 stays enabled).
- **App Version:** the displayed version matches the build metadata source.
- **Auth:** unauthenticated can't set; a User only sets their own.

## Done when

- Settings shows App Version and a working Privacy opt-out that toggles product analytics only
  (Sentry unaffected), defaulting on; tests green; gates pass.

## Out of scope

Actually initializing/gating PostHog (OBS-2); Sentry (OBS-1).
</content>
