# SET-1 · Settings: App Version + analytics opt-out

| | |
|---|---|
| **Status** | Done |
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
monitoring (Sentry, OBS-1) — that stays on regardless (ADR 0013, PRD 181).

## Current state (already built — read before changing)

Most of the scaffolding exists; this slice **wires** it, it doesn't build from scratch.

- **Schema:** `users.analyticsOptOut: v.boolean()` already exists
  (`packages/convex/convex/schema.ts:42`). Bootstrap sets it to `false`
  (`packages/convex/convex/model.ts:48`, the `createUserWithPersonalCircle` path) — default
  **on**.
- **Mutation:** `setAnalyticsOptOut` **already exists** (`packages/convex/convex/users.ts:81`).
  But it duplicates the auth check via `getCurrentUserOrNull` + a manual
  `throw new Error("Not authenticated")` instead of using the `requireCurrentUser` helper
  (`packages/convex/convex/auth.ts:133`), which already throws on a missing user. **Refactor it
  to `requireCurrentUser`** (CLAUDE.md: no bespoke alternative when a helper exists). There is
  **no backend test** for it yet.
- **Query gap:** `getCurrentUser` → `toCurrentUserView` (`packages/convex/convex/users.ts:12`)
  does **not** expose `analyticsOptOut`. The UI has no way to read the current value. This is
  the main wiring task.
- **Route:** `apps/web-app/app/routes/settings.tsx` is **not a placeholder** — it renders a
  working Profile form, a **Privacy section that is text-only** (no toggle), and an About
  section showing a **hardcoded** `const APP_VERSION = "0.0.0"`.
- **Data seam:** mutations are wrapped as hooks in `apps/web-app/app/lib/data/users.ts`
  (e.g. `useUpdateProfile`) and consumed via `~/lib/data.js`. Routes do **not** call
  `useMutation` directly. There is no `useSetAnalyticsOptOut` yet.
- **UI primitives:** `apps/web-app/app/components/ui/` has **no** `switch`/`toggle`/`checkbox`
  component. The toggle control must be added or substituted (see decision below).
- **Test helper:** `apps/web-app/app/test/convex/users.ts` defines `UsersState` (the double's
  config surface) and `makeCurrentUserView`. Both must grow the new field/mutation. Web tests
  share this helper (CLAUDE.md) — don't hand-roll per-file doubles.

## Implement

### Backend (`packages/convex/convex/users.ts`)

1. Refactor `setAnalyticsOptOut` to use `requireCurrentUser(ctx)` (drop the
   `getCurrentUserOrNull` + manual throw). Behavior unchanged: patch `analyticsOptOut`.
2. Add `analyticsOptOut: user.analyticsOptOut` to `toCurrentUserView` so `getCurrentUser`
   exposes it. This propagates the field through the typed contract automatically — see chain
   below.

### Type/session chain (the field must flow end-to-end)

- `CurrentUser` (`apps/web-app/app/lib/data/users.ts`) is derived from the
  `getCurrentUser` return type, so it picks up `analyticsOptOut` with no edit.
- `apps/web-app/app/lib/session.ts`: add `analyticsOptOut: boolean` to the `SessionUser`
  interface, and map it in **both** `useRealSession` (from `user.analyticsOptOut`) **and**
  `useMockSession` (default `false`).

### Data seam (`apps/web-app/app/lib/data/users.ts`)

- Add `useSetAnalyticsOptOut` mirroring `useUpdateProfile`
  (`return useMutation(api.users.setAnalyticsOptOut);`). Exported via the `~/lib/data.js`
  barrel already (`export * from "./data/users.js"`).

### Web UI (`apps/web-app/app/routes/settings.tsx`)

- Replace the text-only Privacy `<p>` with a real opt-out **toggle** bound to
  `useSetAnalyticsOptOut` and seeded from `session.user.analyticsOptOut`. Mirror the
  Profile form's UX: optimistic disable while the mutation is in flight, snackbar via
  `useSnackbar`, and `console.error` + a friendly message on failure. Label it as a
  **product-analytics** opt-out and note Sentry/error monitoring is unaffected.
  - **Control decision (no `switch` primitive exists):** prefer adding a small, accessible
    `components/ui/switch.tsx` (a `role="switch"` button with `aria-checked`, styled to match
    `button.tsx`/`field.tsx`) so it's reusable. A native `<input type="checkbox">` wrapped in
    `Field`/`FieldLabel` is an acceptable fallback. Do **not** repurpose a plain `Button`
    without a switch/checkbox role — tests and a11y need an accessible toggle name+state.
- Replace the hardcoded `APP_VERSION` with the build-injected version (next section).

### App Version from build metadata (not hardcoded)

- Source of truth: `apps/web-app/package.json` `version` (currently `"0.0.0"`).
- Inject at build time via Vite `define` in `apps/web-app/vite.config.ts`, e.g.
  `define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0") }`
  (pnpm/npm set `npm_package_version` for scripts; the `?? "0.0.0"` keeps `vite` invoked
  outside a script script-safe). Add a global type declaration (e.g. in an existing `*.d.ts`
  or `declare const __APP_VERSION__: string;`) so `settings.tsx` reads `__APP_VERSION__`
  type-safely with no `as` cast. The same constant feeds Feedback (FBK-1) later.

### Tests

- **Backend** (`packages/convex/convex/users.test.ts`): add a `describe("setAnalyticsOptOut")`
  block. The auth mock infra is already at the top of the file (`mockCurrentUser` +
  `requireCurrentUser`). Assert: toggling to `true` persists `analyticsOptOut: true`; toggling
  back to `false` persists `false`; a freshly bootstrapped User defaults to `false`;
  unauthenticated throws.
- **Web** (`apps/web-app/app/routes/settings.test.tsx` + shared helper):
  - Extend `apps/web-app/app/test/convex/users.ts`: add `setAnalyticsOptOut?: Mock` to
    `UsersState` and register it in the double's `mutations`; add `analyticsOptOut: false` to
    the `makeCurrentUserView` default (typecheck will force this once the backend field lands).
  - Add toggle tests to `settings.test.tsx`: the control reflects the current value (off when
    `analyticsOptOut: false`, on when `true`); flipping it calls `setAnalyticsOptOut` with the
    new value and shows the confirmation snackbar; failure shows the error message.
  - Add an App Version assertion: the About section renders the injected version.

## Why this way

- **Opt-out is product-analytics only** — keep Sentry independent (ADR 0013). One toggle must
  not disable error monitoring.
- **Refactor to `requireCurrentUser`** rather than leaving the duplicated auth check — the
  helper exists and is the contract every other mutation uses (CLAUDE.md root-cause rule).
- **App Version from build metadata**, not a hardcoded literal — so it reflects the deployed
  build and stays correct without manual edits.
- Default analytics **on** after signup legal acceptance (PRD 183); opt-out flips it off.

## How to test

- **Opt-out:** toggling persists `analyticsOptOut`; `getCurrentUser` reflects it; default is
  `false` (on) for a freshly bootstrapped User.
- **Independence:** opting out only patches `analyticsOptOut` — assert it touches nothing
  related to error monitoring (OBS-1/Sentry config is out of scope here, so there's no Sentry
  wiring to disturb; the test just confirms the mutation's blast radius is the single field).
- **App Version:** the displayed version matches the injected build-metadata source.
- **Auth:** unauthenticated can't set; a User only sets their own.

## Done when

- Settings shows the build-injected App Version and a working, accessible Privacy opt-out
  toggle that persists `analyticsOptOut` (product analytics only; nothing else touched),
  defaulting on; the value round-trips through `getCurrentUser` → session; tests green;
  `pnpm lint`, `typecheck`, `test` pass.

## Out of scope

Actually initializing/gating PostHog on the opt-out value (OBS-2); Sentry setup (OBS-1).
