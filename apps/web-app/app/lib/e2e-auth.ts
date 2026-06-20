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
            // react-doctor-disable-next-line react-doctor/async-await-in-loop -- retry/poll loop; each await depends on the prior attempt's outcome (the backend trigger may not have run yet), so iterations are inherently sequential — Promise.all doesn't apply.
            await convex.mutation(api.users.completeOnboarding, { displayName: name });
            return;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // react-doctor-disable-next-line react-doctor/js-set-map-lookups -- String.prototype.includes (substring match on an error message), not Array membership; a Set can't model substring search.
            if (message.includes("Onboarding already completed")) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
        throw new Error("E2E sign-in: onboarding completion timed out");
      },
      /** Accept a pending invitation by token (E2E-only backend; MEM-3 will replace this). */
      async acceptInvitation(token: string) {
        await convex.mutation(api.e2e.acceptInvitationForE2E, { token });
      },
    },
  });
}
