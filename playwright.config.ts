import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a REAL, self-hosted Convex backend (ADR 0019):
 * the real frontend → Convex functions → DB path. Google OAuth is replaced by the
 * flag-gated email+password bypass (E2E_TEST_AUTH on the backend, VITE_E2E on the
 * app); outbound vendors are MSW-mocked once they exist. There is no mock-mode
 * E2E suite — fast UI checks live in the Vitest render tests (e.g. home.test.tsx).
 *
 * Auth: each Playwright worker gets its own User + Personal Circle via
 * `e2e/fixtures.ts` (per-worker `storageState` under `e2e/.auth/worker-*.json`), so
 * parallel desktop/mobile projects do not share one Circle.
 *
 * The CI workflow sets VITE_CONVEX_URL / VITE_CONVEX_SITE_URL to the self-hosted
 * backend's origins; locally they default to the docker-compose ports.
 */
const PORT = 5173;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI defaults to 1 worker; we run 4 (ubuntu-latest has 4 vCPUs). Safe because each
  // Playwright worker gets its own User + Personal Circle (see e2e/fixtures.ts), so
  // parallel tests can't clobber each other's data against the single self-hosted
  // backend. Locally, leave undefined (Playwright picks ~half the cores).
  workers: process.env.CI ? 4 : undefined,
  // CI: `github` for inline PR annotations plus `html` for an uploadable report
  // (written to playwright-report/) so failed runs leave a trace to inspect.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm --filter @spend-circle/web-app dev --host 127.0.0.1",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_E2E: "true",
      VITE_CONVEX_URL: process.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3210",
      VITE_CONVEX_SITE_URL: process.env.VITE_CONVEX_SITE_URL ?? "http://127.0.0.1:3211",
    },
  },
});
