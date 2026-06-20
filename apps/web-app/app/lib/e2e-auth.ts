import { api } from "@spend-circle/convex";
import { authClient } from "./auth-client.js";
import { convex } from "./convex.js";
import type { Circle, Member } from "./data.js";
import { parseCircleRef } from "./refs.js";

function isConvexId(value: string) {
  return /^[a-z0-9]+$/i.test(value);
}

/** Convex Id brands are nominal; URL segments are validated before minting (see `testId`). */
function brandCircleId(value: string): Circle["id"] {
  return value as Circle["id"];
}

/** Convex Id brands are nominal; Playwright passes serialized ids from seed helpers. */
function brandMemberId(value: string): Member["id"] {
  return value as Member["id"];
}

function circleIdFromLocation(): Circle["id"] {
  const ref = window.location.pathname.match(/\/circles\/([^/]+)/)?.[1];
  const parsed = parseCircleRef(ref);
  const id = parsed?.id;
  if (!id || !isConvexId(id)) {
    throw new Error("E2E: not on a Circle route");
  }
  return brandCircleId(id);
}

function memberIdFromString(memberId: string): Member["id"] {
  if (!isConvexId(memberId)) {
    throw new Error("E2E removeMember: invalid member id");
  }
  return brandMemberId(memberId);
}

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

      /** Seeds an active Member on the current Circle route (MEM-5 E2E until MEM-3). */
      async seedActiveMember(email: string, displayName: string) {
        return convex.mutation(api.e2e.seedActiveMember, {
          circleId: circleIdFromLocation(),
          email,
          displayName,
        });
      },

      /** Calls removeMember for the current Circle route (permission probes). */
      async removeMember(memberId: string) {
        return convex.mutation(api.members.removeMember, {
          circleId: circleIdFromLocation(),
          memberId: memberIdFromString(memberId),
        });
      },
    },
  });
}
