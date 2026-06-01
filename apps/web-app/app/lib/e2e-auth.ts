import { authClient } from "./auth-client.js";

/**
 * E2E-only test-auth helper (ADR 0019). Exposes a tiny `window.__scE2E` so the
 * Playwright global-setup can establish a REAL Better Auth session via the
 * flag-gated email+password path — without driving Google OAuth, which Playwright
 * can't automate. The client persists the session in its own storage, which
 * Playwright then captures as `storageState`.
 *
 * This whole module is imported only behind `VITE_E2E` (see entry.client.tsx), so
 * the production bundle eliminates it entirely. Production stays Google-only.
 */
export function installE2EAuthHelper(): void {
  Object.assign(window as object, {
    __scE2E: {
      /**
       * Sign up (first run for a unique email) then sign in. Sign-up triggers the
       * backend `onCreateUser` → the User + their Personal Circle, so the
       * authenticated app immediately has real data to render.
       */
      async signIn(email: string, password: string, name = "E2E Tester") {
        await authClient.signUp.email({ email, password, name }).catch(() => {
          // Already exists (re-run with same email) — fall through to sign-in.
        });
        return authClient.signIn.email({ email, password });
      },
    },
  });
}
