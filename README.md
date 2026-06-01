# Spend Circle

Local-first monorepo for the Spend Circle web app, Convex backend, and domain package.

## Prerequisites

- Node.js
- pnpm
- Convex account/project
- Google OAuth web client

This repo uses pnpm workspaces. On this machine, pnpm is available at:

```sh
/opt/homebrew/bin/pnpm
```

## Install

```sh
/opt/homebrew/bin/pnpm install
```

## Environment

Create `.env.local` at the repo root:

```sh
CONVEX_DEPLOYMENT=dev:<your-convex-dev-deployment>
VITE_CONVEX_URL=https://<your-deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<your-deployment>.convex.site
SITE_URL=http://127.0.0.1:5173
BETTER_AUTH_SECRET=<random-secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
```

Add this Google OAuth authorized redirect URI:

```text
http://127.0.0.1:5173/api/auth/callback/google
```

## Configure Convex

Push backend code, install the Better Auth component, and generate the typed
API. Convex lives in `packages/convex` and reads the shared root `.env.local`:

```sh
/opt/homebrew/bin/pnpm --filter @spend-circle/convex dev
```

Set the backend auth env vars on the Convex dev deployment (the app origin and
Google credentials Better Auth needs):

```sh
/opt/homebrew/bin/pnpm --filter @spend-circle/convex exec convex env set SITE_URL http://127.0.0.1:5173
/opt/homebrew/bin/pnpm --filter @spend-circle/convex exec convex env set GOOGLE_CLIENT_ID <id>
/opt/homebrew/bin/pnpm --filter @spend-circle/convex exec convex env set GOOGLE_CLIENT_SECRET <secret>
/opt/homebrew/bin/pnpm --filter @spend-circle/convex exec convex env set BETTER_AUTH_SECRET <secret>
```

> Auth runs as a Convex component in SPA mode (no app server), so Google's
> authorized redirect URI must point at the Convex site URL:
> `<VITE_CONVEX_SITE_URL>/api/auth/callback/google`.

## Run App

```sh
/opt/homebrew/bin/pnpm --filter @spend-circle/web-app dev --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/
```

In normal local dev, `Continue with Google` starts the real Google OAuth flow against real vendors, so authentication is exercised before production.

To bypass auth and mock third-party vendors (Resend, PostHog, Sentry) via MSW, run mock mode with the `VITE_MOCKS` flag:

```sh
/opt/homebrew/bin/pnpm --filter @spend-circle/web-app dev:mocks --host 127.0.0.1
```

Playwright end-to-end tests always run in mock mode, so they never drive the OAuth flow.

## Checks

```sh
/opt/homebrew/bin/pnpm test
/opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm build
/opt/homebrew/bin/pnpm test:e2e
```
