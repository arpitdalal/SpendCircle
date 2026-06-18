import { api } from "@spend-circle/convex";
import { authClient } from "./auth-client.js";
import { convex } from "./convex.js";

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
       * authenticated app immediately has real data to render. Completes USR-1
       * onboarding so the protected shell is reachable without driving the form.
       */
      async signIn(email: string, password: string, name = "E2E Tester") {
        await authClient.signUp.email({ email, password, name }).catch(() => {
          // Already exists (re-run with same email) — fall through to sign-in.
        });
        await authClient.signIn.email({ email, password });

        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          try {
            await convex.mutation(api.users.completeOnboarding, { displayName: name });
            return;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("Onboarding already completed")) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
        throw new Error("E2E sign-in: onboarding completion timed out");
      },
    },
  });
}
