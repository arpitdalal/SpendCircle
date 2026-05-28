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

Push backend code and install the Better Auth component:

```sh
/opt/homebrew/bin/pnpm exec convex dev --once --typecheck disable
```

Upload backend env vars to the Convex dev deployment:

```sh
/opt/homebrew/bin/pnpm exec convex env set --from-file .env.local
```

## Run App

```sh
/opt/homebrew/bin/pnpm --filter @spend-circle/web-app dev --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/
```

In normal local dev, `Continue with Google` starts the real Google OAuth flow. For automated tests, the app uses dev auth via `VITE_AUTH_MODE=dev`.

## Checks

```sh
/opt/homebrew/bin/pnpm test
/opt/homebrew/bin/pnpm typecheck
/opt/homebrew/bin/pnpm build
/opt/homebrew/bin/pnpm test:e2e
```

